/**
 * Wybór adaptera KSeF.
 *
 * Jedyne miejsce w aplikacji, które wie, że istnieją dwie implementacje.
 * Przełącznik jest zmienną środowiskową, a nie flagą w kodzie, żeby wdrożenie
 * demonstracyjne mogło działać na danych zastępczych nawet wtedy, gdy
 * środowisko testowe KSeF jest niedostępne (okno serwisowe 16:00-18:00).
 */
import type { KsefClient } from "@/lib/ksef/client";
import { getKsefClient as getMockClient } from "@/lib/ksef/mock-client";
import { createHttpKsefClient } from "@/server/ksef/http-client";

export function getKsefClient(options?: { simulateFailure?: boolean }): KsefClient {
  if (process.env.KSEF_CLIENT === "http") {
    return createHttpKsefClient();
  }
  return getMockClient(options);
}
