/**
 * Klient HTTP dla warstwy danych przeglądarki.
 *
 * Jedno miejsce, w którym wiadomo, jak wygląda odpowiedź błędu z API. Bez tego
 * każdy komponent musiałby sam zgadywać, czy dostał `{ message }`, czy surowy
 * tekst — a komunikat dla użytkownika i tak powinien być jeden i ten sam.
 */

export interface ApiFailure {
  message: string;
  /** Błędy przypisane do pól formularza, w formacie zrozumiałym dla UI. */
  fields?: Record<string, string>;
  status: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiError";
    this.status = failure.status;
    this.fields = failure.fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // Zerwana sieć nie może wyglądać jak błąd walidacji — inaczej użytkownik
    // szuka literówki w formularzu zamiast sprawdzić połączenie.
    throw new ApiError({ message: "Brak połączenia z serwerem.", status: 0 });
  }

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  if (!response.ok) {
    const failure = (payload ?? {}) as { message?: string; fields?: Record<string, string> };
    throw new ApiError({
      message: failure.message ?? `Serwer odpowiedział błędem ${response.status}.`,
      fields: failure.fields,
      status: response.status,
    });
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Buduje query string, pomijając wartości puste i powtarzając klucze tablic. */
export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
