import crypto from "node:crypto";

export const BASE = "https://api-test.ksef.mf.gov.pl/api/v2";

export async function call(method, path, { body, token, raw } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return raw ? text : text ? JSON.parse(text) : null;
}

/** Certyfikaty klucza publicznego MF, wg przeznaczenia. */
export async function publicKey(usage) {
  const keys = await call("GET", "/security/public-key-certificates");
  const entry = keys.find((k) => k.usage.includes(usage));
  const pem = `-----BEGIN CERTIFICATE-----\n${entry.certificate.replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----`;
  return new crypto.X509Certificate(pem).publicKey;
}

const rsaOaep = (key, buf) =>
  crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, buf);

/** Uwierzytelnienie tokenem KSeF → accessToken. */
export async function authenticate({ nip, token }) {
  const key = await publicKey("KsefTokenEncryption");
  const challenge = await call("POST", "/auth/challenge");
  const encryptedToken = rsaOaep(key, Buffer.from(`${token}|${challenge.timestampMs}`)).toString("base64");

  const init = await call("POST", "/auth/ksef-token", {
    body: { challenge: challenge.challenge, contextIdentifier: { type: "Nip", value: nip }, encryptedToken },
  });

  for (let i = 0; i < 30; i += 1) {
    const status = await call("GET", `/auth/${init.referenceNumber}`, { token: init.authenticationToken.token });
    if (status.status.code === 200) break;
    if (status.status.code >= 400) throw new Error(`Uwierzytelnienie odrzucone: ${status.status.description}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tokens = await call("POST", "/auth/token/redeem", { token: init.authenticationToken.token });
  return tokens.accessToken.token;
}

/** Otwiera sesję interaktywną FA(3) i zwraca uchwyt do wysyłania faktur. */
export async function openSession(accessToken) {
  const key = await publicKey("SymmetricKeyEncryption");
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  const session = await call("POST", "/sessions/online", {
    token: accessToken,
    body: {
      formCode: { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" },
      encryption: {
        encryptedSymmetricKey: rsaOaep(key, aesKey).toString("base64"),
        initializationVector: iv.toString("base64"),
      },
    },
  });

  const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("base64");

  return {
    referenceNumber: session.referenceNumber,
    async send(xml) {
      const plain = Buffer.from(xml, "utf8");
      const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv); // PKCS#7 domyślnie
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);

      return call("POST", `/sessions/online/${session.referenceNumber}/invoices`, {
        token: accessToken,
        body: {
          invoiceHash: sha256(plain),
          invoiceSize: plain.length,
          encryptedInvoiceHash: sha256(encrypted),
          encryptedInvoiceSize: encrypted.length,
          encryptedInvoiceContent: encrypted.toString("base64"),
        },
      });
    },
    close: () => call("POST", `/sessions/online/${session.referenceNumber}/close`, { token: accessToken }),
  };
}
