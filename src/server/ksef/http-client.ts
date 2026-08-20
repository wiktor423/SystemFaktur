/**
 * Klient KSeF API 2.0 dla środowiska testowego.
 *
 * Implementuje ten sam interfejs `KsefClient` co adapter mock, więc reszta
 * aplikacji nie wie, z którym rozmawia. Zweryfikowany na żywym środowisku
 * `api-test.ksef.mf.gov.pl` — surowe odpowiedzi leżą w
 * `src/lib/ksef/__fixtures__/`.
 *
 * Uwierzytelnianie idzie ścieżką tokenową (`/auth/ksef-token`), nie podpisem
 * XAdES. Token KSeF wydaje się jednorazowo po uwierzytelnieniu podpisem
 * (instrukcja w README) i od tego momentu proces w tle nie potrzebuje
 * certyfikatu — co jest jedynym sensownym układem dla harmonogramu.
 */
import crypto from "node:crypto";
import { KsefError, type KsefClient, type KsefFetchParams, type KsefInvoice } from "@/lib/ksef/client";
import { parseFaInvoice } from "@/server/fa-parser";
import { stripSeparators } from "@/lib/domain/validation";

interface Challenge {
  challenge: string;
  timestampMs: number;
}

interface TokenPair {
  accessToken: string;
  /** Moment wygaśnięcia access tokena (epoch ms), z zapasem bezpieczeństwa. */
  expiresAt: number;
  refreshToken: string;
}

interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  acquisitionDate: string;
  currency: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  seller?: { nip?: string; name?: string };
  buyer?: { identifier?: { value?: string }; name?: string };
}

/** Access token żyje kilkanaście minut; odnawiamy go minutę przed czasem. */
const EXPIRY_MARGIN_MS = 60_000;
const PAGE_SIZE = 100;

export class HttpKsefClient implements KsefClient {
  private tokens: TokenPair | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly nip: string,
    private readonly ksefToken: string,
  ) {}

  async fetchInvoices(params: KsefFetchParams): Promise<KsefInvoice[]> {
    if (params.dateTo < params.dateFrom) {
      throw new KsefError("Zakres dat jest odwrócony.", "invalid-range");
    }

    // Subject1 to kontekst sprzedawcy (faktury sprzedażowe), Subject2 nabywcy
    // (kosztowe) — dokładnie rozróżnienie, którego wymaga zadanie.
    const subjects: Array<{ subjectType: "Subject1" | "Subject2"; direction: "sale" | "purchase" }> = [];
    if (params.scope === "purchase" || params.scope === "both") {
      subjects.push({ subjectType: "Subject2", direction: "purchase" });
    }
    if (params.scope === "sale" || params.scope === "both") {
      subjects.push({ subjectType: "Subject1", direction: "sale" });
    }

    const invoices: KsefInvoice[] = [];
    for (const subject of subjects) {
      const metadata = await this.queryMetadata(subject.subjectType, params.dateFrom, params.dateTo);
      for (const entry of metadata) {
        invoices.push(await this.toInvoice(entry, subject.direction));
      }
    }
    return invoices;
  }

  /* ----------------------------- Uwierzytelnianie ---------------------------- */

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokens && this.tokens.expiresAt > now) return this.tokens.accessToken;

    if (this.tokens) {
      // Odświeżenie jest tańsze niż pełne uwierzytelnienie; gdy refresh token
      // też wygasł, spadamy do pełnej ścieżki.
      try {
        const refreshed = await this.request<{ accessToken: { token: string } }>("POST", "/auth/token/refresh", {
          token: this.tokens.refreshToken,
        });
        this.tokens = { ...this.tokens, ...this.decodeAccess(refreshed.accessToken.token) };
        return this.tokens.accessToken;
      } catch {
        this.tokens = null;
      }
    }

    this.tokens = await this.authenticate();
    return this.tokens.accessToken;
  }

  private async authenticate(): Promise<TokenPair> {
    const certificates = await this.request<Array<{ usage: string[]; certificate: string }>>(
      "GET",
      "/security/public-key-certificates",
    );
    const entry = certificates.find((item) => item.usage.includes("KsefTokenEncryption"));
    if (!entry) throw new KsefError("KSeF nie udostępnił klucza do szyfrowania tokena.", "unavailable");

    const pem = `-----BEGIN CERTIFICATE-----\n${entry.certificate.replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;
    const publicKey = new crypto.X509Certificate(pem).publicKey;

    const challenge = await this.request<Challenge>("POST", "/auth/challenge");

    // Token szyfrowany razem ze znacznikiem czasu z wyzwania — przechwycony
    // szyfrogram jest bezużyteczny po wygaśnięciu wyzwania.
    const encryptedToken = crypto
      .publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        Buffer.from(`${this.ksefToken}|${challenge.timestampMs}`),
      )
      .toString("base64");

    const init = await this.request<{ referenceNumber: string; authenticationToken: { token: string } }>(
      "POST",
      "/auth/ksef-token",
      {
        body: {
          challenge: challenge.challenge,
          contextIdentifier: { type: "Nip", value: this.nip },
          encryptedToken,
        },
      },
    );

    await this.awaitAuthentication(init.referenceNumber, init.authenticationToken.token);

    const redeemed = await this.request<{ accessToken: { token: string }; refreshToken: { token: string } }>(
      "POST",
      "/auth/token/redeem",
      { token: init.authenticationToken.token },
    );

    return {
      ...this.decodeAccess(redeemed.accessToken.token),
      refreshToken: redeemed.refreshToken.token,
    };
  }

  /** Uwierzytelnienie jest asynchroniczne — odpytujemy do skutku. */
  private async awaitAuthentication(referenceNumber: string, token: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await this.request<{ status: { code: number; description: string } }>(
        "GET",
        `/auth/${referenceNumber}`,
        { token },
      );
      if (status.status.code === 200) return;
      if (status.status.code >= 400) {
        throw new KsefError(`KSeF odrzucił uwierzytelnienie: ${status.status.description}`, "auth");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new KsefError("Uwierzytelnienie w KSeF nie zakończyło się w wyznaczonym czasie.", "timeout");
  }

  private decodeAccess(token: string): { accessToken: string; expiresAt: number } {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp: number };
      return { accessToken: token, expiresAt: payload.exp * 1000 - EXPIRY_MARGIN_MS };
    } catch {
      // Nieczytelny JWT nie powinien wywracać integracji — traktujemy go jako
      // ważny przez minutę i odnawiamy przy kolejnym żądaniu.
      return { accessToken: token, expiresAt: Date.now() + EXPIRY_MARGIN_MS };
    }
  }

  /* ------------------------------- Pobieranie -------------------------------- */

  private async queryMetadata(
    subjectType: "Subject1" | "Subject2",
    dateFrom: string,
    dateTo: string,
  ): Promise<InvoiceMetadata[]> {
    const token = await this.accessToken();
    const collected: InvoiceMetadata[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = await this.request<{ invoices: InvoiceMetadata[]; hasMore: boolean }>(
        "POST",
        `/invoices/query/metadata?pageOffset=${offset / PAGE_SIZE}&pageSize=${PAGE_SIZE}`,
        {
          token,
          body: {
            subjectType,
            // `Issue` to data wystawienia z faktury. `Invoicing` oznaczałoby
            // moment przyjęcia przez KSeF — filtr rozjechałby się z tym,
            // czego użytkownik oczekuje po polu "data wystawienia".
            dateRange: { dateType: "Issue", from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
          },
        },
      );
      collected.push(...page.invoices);
      if (!page.hasMore || page.invoices.length === 0) break;
    }

    return collected;
  }

  /**
   * Metadane nie zawierają terminu płatności ani rachunku — te są wyłącznie
   * w pełnym XML. Dlatego po każdą fakturę idzie osobne żądanie i dopiero
   * treść dokumentu daje komplet danych do rejestru.
   */
  private async toInvoice(entry: InvoiceMetadata, direction: "purchase" | "sale"): Promise<KsefInvoice> {
    const token = await this.accessToken();
    const xml = await this.request<string>("GET", `/invoices/ksef/${entry.ksefNumber}`, { token, raw: true });
    const parsed = parseFaInvoice(xml);

    return {
      ksefNumber: entry.ksefNumber,
      invoiceNumber: parsed.invoiceNumber,
      issueDate: parsed.issueDate,
      saleDate: parsed.saleDate,
      dueDate: parsed.dueDate ?? parsed.issueDate,
      currency: parsed.currency,
      seller: parsed.seller,
      buyer: parsed.buyer,
      lines: parsed.lines,
      netAmount: parsed.netAmount,
      vatAmount: parsed.vatAmount,
      grossAmount: parsed.grossAmount,
      paymentAccount: parsed.paymentAccount,
      direction,
      acquisitionTimestamp: entry.acquisitionDate ?? new Date().toISOString(),
    };
  }

  /* --------------------------------- Transport ------------------------------- */

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; token?: string; raw?: boolean } = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new KsefError("KSeF nie odpowiedział w wyznaczonym czasie.", "timeout");
      }
      throw new KsefError("Nie udało się połączyć ze środowiskiem KSeF.", "unavailable");
    }

    const text = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Wygasła sesja unieważnia cache tokenów — kolejna próba uwierzytelni od nowa.
        this.tokens = null;
        throw new KsefError("KSeF odrzucił poświadczenia. Sprawdź token w konfiguracji.", "auth");
      }
      throw new KsefError(`KSeF odpowiedział błędem ${response.status}. Żaden dokument nie został pobrany.`, "unavailable");
    }

    if (options.raw) return text as T;
    return (text ? JSON.parse(text) : null) as T;
  }
}

/** Buduje klienta z konfiguracji środowiskowej. Rzuca, gdy brakuje sekretów. */
export function createHttpKsefClient(): HttpKsefClient {
  const baseUrl = process.env.KSEF_BASE_URL;
  const nip = stripSeparators(process.env.KSEF_NIP ?? "");
  const token = process.env.KSEF_TOKEN;

  if (!baseUrl || !nip || !token) {
    throw new KsefError(
      "Integracja z KSeF nie jest skonfigurowana (KSEF_BASE_URL, KSEF_NIP, KSEF_TOKEN).",
      "auth",
    );
  }
  return new HttpKsefClient(baseUrl, nip, token);
}
