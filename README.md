# Gumijagoda — moduł zarządzania fakturami

Aplikacja do ewidencji faktur kosztowych i sprzedażowych: rejestr z filtrowaniem
i konfigurowalnymi kolumnami, pobieranie z KSeF do bufora akceptacyjnego,
kategoryzacja z regułami automatycznymi i podgląd dokumentów w przeglądarce.

**Wdrożona wersja:** https://lexalpha.onrender.com/

Integracja z KSeF jest **prawdziwa**, nie zasymulowana. Aplikacja uwierzytelnia
się w środowisku testowym Ministerstwa Finansów i pobiera stamtąd faktury FA(3),
które sami wystawiliśmy skryptem zasilającym piaskownicę.

---

## Uruchomienie

```bash
docker compose up
```

Podnosi bazę, nakłada migracje, zasila dane demonstracyjne i uruchamia
aplikację na `http://localhost:3000`.

Do pracy nad kodem:

```bash
docker compose up -d db
cp .env.example .env      # uzupełnij DATABASE_URL
npm ci && npm run db:migrate && npm run db:seed
npm run dev
```

Testy:

```bash
npm test          # jednostkowe i integracyjne (wymagają bazy)
npm run test:e2e  # Playwright, pełna ścieżka w przeglądarce
```

---

## Architektura

Podział na trzy warstwy jest ścisły: logika biznesowa nie żyje w komponentach
React ani w route handlerach.

```
src/
├─ app/(app)/          strony — wyłącznie stan interfejsu
├─ app/api/            route handlery: parsuj, zawołaj serwis, zwróć
├─ components/         UI na tokenach motywu, bez dostępu do bazy
├─ lib/domain/         typy i czyste reguły (NIP mod 11, IBAN mod 97)
├─ lib/validation/     schematy Zod wołające te same czyste reguły
├─ lib/data/           warstwa danych przeglądarki (fetch + kontekst)
├─ lib/ksef/           interfejs `KsefClient` i adapter mock
└─ server/             serwisy, mappery, import KSeF, harmonogram
```

**Filtrowanie, sortowanie i stronicowanie wykonuje baza.** Rejestr ma rosnąć,
a wciąganie całej ewidencji do przeglądarki po to, żeby odrzucić 95% rekordów,
przestaje działać przy pierwszym większym kliencie. Podsumowania nad tabelą
liczą się osobnym agregatem dla **całego** wyniku filtrowania, nie dla widocznej
strony — inaczej kwoty zmieniałyby się przy przewijaniu.

Stack zgodny z wymaganym: Next.js 15 (App Router) + TypeScript, PostgreSQL 17
z Prismą 7, Zod, node-cron, Vitest i Playwright.

---

## Decyzje projektowe

**Deduplikacja jest ograniczeniem bazy, nie warunkiem w kodzie.** Sprawdzenie
„czy taki dokument już jest, a jeśli nie, to wstaw" ma okno między odczytem
a zapisem — dwa jednoczesne pobrania trafiają w nie i tworzą duplikat. Zamiast
tego wstawiamy i pozwalamy bazie odrzucić kolizję na unikalnym indeksie
(`ksefNumber` oraz para `kontrahent + numer`). Odrzucenie jest normalnym
wynikiem, nie awarią. Testy sprawdzają to przy trzech równoległych zapisach.

**Bufor to stan dokumentu, nie osobny byt.** Akceptacja zmienia `stage`, więc
nie przepisuje rekordu i nie gubi powiązań z załącznikiem ani pozycjami.

**Harmonogram jest idempotentny na poziomie bazy.** Każdy przebieg zapisuje
unikalną parę `(jobName, scheduledFor)`. Przy kilku replikach wszystkie obudzą
się w tej samej minucie, ale tylko jedna założy wpis — reszta cicho odpuści.
Bez tego trzy repliki pobrałyby faktury trzy razy.

**Wyzwalacz czasowy jest oddzielony od logiki pobierania.** Cron woła endpoint
`/api/ksef/scheduled-run`, a nie bazę bezpośrednio. Dzięki temu przebieg
automatyczny idzie tą samą ścieżką co ręczny (jedna implementacja, nie dwie),
a wyzwalacz da się wymienić na zewnętrzny — co okazało się potrzebne przy
wdrożeniu, bo darmowa instancja usypia i nie odpaliłaby crona w procesie.

**Kwoty jako `Decimal(14,2)`.** Float na pieniądzach gubi grosze przy sumowaniu.

**Reguła kategorii nie nadpisuje decyzji użytkownika.** Uzupełnia wyłącznie
brak kategorii; zapis z formularza gasi znacznik przypisania automatycznego.

---

## Integracja z KSeF

Uwierzytelnianie idzie ścieżką tokenową (`/auth/ksef-token`), nie podpisem
XAdES. Token KSeF wydaje się jednorazowo po uwierzytelnieniu certyfikatem,
a od tego momentu proces w tle nie potrzebuje certyfikatu — jedyny sensowny
układ dla harmonogramu.

Dwie rzeczy odkryte dopiero na żywym API, obie z konsekwencjami:

- **Metadane nie zawierają terminu płatności ani rachunku.** Są wyłącznie
  w pełnym XML, więc import dociąga każdą fakturę osobno.
- **`DateType` ma trzy warianty.** Do filtra „data wystawienia" właściwy jest
  `Issue`; `Invoicing` to moment przyjęcia przez KSeF i dałby ciche rozjechanie
  filtrów.

Adapter wybiera zmienna `KSEF_CLIENT` (`http` albo `mock`). Mock zostaje jako
zapasowy, bo środowisko testowe MF ma codzienne okno serwisowe 16:00–18:00.
Skrypty zasilające piaskownicę leżą w `scripts/ksef/` — to narzędzia
deweloperskie, nie funkcja aplikacji, bo wystawianie faktur jest poza zakresem
zadania.

---

## Testy

**52 testy**: 27 jednostkowych, 17 integracyjnych, 8 e2e.

Integracyjne chodzą na prawdziwym PostgreSQL-u, bo deduplikacji opartej na
unikalnym indeksie nie da się udowodnić na mocku bazy. Parser FA sprawdzany jest
na prawdziwym pliku pobranym z KSeF, nie na XML-u napisanym pod test.

Test równoległości wykrył realny błąd produkcyjny: Prisma scala jednoczesne
`findUnique` w zapytanie z `IN (...)`, czego boolowski klucz główny nie
obsługiwał — dwa równoległe żądania do `/api/bootstrap` wywracały się losowo.

---

## Założenia

- **Tryb jednego użytkownika**, zgodnie z dopuszczeniem w zadaniu. Bez logowania
  i ról; ustawienia kolumn są wspólne dla instalacji.
- **Upload PDF nie tworzy dokumentu automatycznie.** Z PDF nie da się odczytać
  kwot ani terminów, więc plik otwiera formularz z załącznikiem do uzupełnienia.
  XML w schemacie FA wczytuje dane sam.
- **Wgrany dokument trafia do bufora**, tak samo jak pobrany z KSeF — obieg
  akceptacyjny powinien być jeden, niezależnie od źródła.
- **Filtr po kategorii obejmuje całe poddrzewo.** Wybranie „Logistyki" pokazuje
  też „Transport chłodniczy".
- **Załączniki trzymane w bazie.** Świadomy kompromis na tę skalę; przy
  większych wolumenach właściwe jest object storage.

---

## Znane ograniczenia

- Załączniki w bazie zamiast w object storage.
- Podgląd PDF przez `<iframe>` z natywną przeglądarką — wystarcza do
  przewijania i powiększania, ale nie daje kontroli nad interfejsem.
- Przyrostowe pobieranie (znacznik high-water mark z KSeF) jest w schemacie
  jako `KsefCursor`, ale nieużywane — import wciąż odpytuje pełny zakres dat.
- Na darmowym planie działa jedna replika, więc mechanizmy odporności na
  współbieżność nie mają okazji się wykazać.

---

## Co zrobiłbym dalej

1. **Przyrostowe pobieranie po znaczniku HWM** zamiast odpytywania tego samego
   zakresu dat. KSeF zwraca `permanentStorageHwmDate` właśnie po to, a przy
   powtórzonym pobraniu trafiliśmy już na limit żądań (HTTP 429).
2. **Object storage na załączniki**, z podpisanymi adresami zamiast strumienia
   przez aplikację.
3. **Historia zmian dokumentu** — kto i kiedy zmienił kategorię lub kwoty.
4. **Auto-uzupełnianie kontrahenta po NIP** z wykazu podatników i weryfikacja
   rachunku na białej liście VAT (zadania dodatkowe z sekcji 11).

---

## Research rynku

Z Fakturowni, inFaktu i Symfonii przejąłem dwie rzeczy: obieg dwuetapowy
(dokumenty z KSeF trafiają do poczekalni, nie wprost do ksiąg) oraz gęstą tabelę
z konfigurowalnymi kolumnami zamiast kart, bo praca z fakturami polega na
skanowaniu wielu wierszy naraz. Różnica jest w integracji — większość narzędzi
deduplikuje po numerze w warstwie aplikacji, tutaj robi to baza, bo pobranie
ręczne i automatyczne mogą się spotkać w czasie i wtedy sprawdzenie w kodzie
zawodzi.

---

## Dane demonstracyjne

Seed zakłada 21 kategorii w drzewie, 5 typów dokumentów, 14 kontrahentów
z poprawnymi sumami kontrolnymi NIP i IBAN oraz 42 dokumenty. Sześciu
kontrahentów ma NIP-y zgodne z podmiotami zarejestrowanymi w naszej piaskownicy
KSeF, żeby import trafiał na istniejącą kartotekę zamiast zakładać drugą.

```bash
npm run db:seed    # ponowne zasilenie
npm run db:reset   # migracje od zera i seed
```
