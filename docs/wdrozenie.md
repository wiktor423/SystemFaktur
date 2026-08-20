# Wdrożenie

Aplikacja stoi na [Render](https://render.com), a proces budowania i wdrażania
prowadzi GitHub Actions. Konfiguracja infrastruktury mieszka w `render.yaml`,
więc jest wersjonowana razem z kodem — odtworzenie środowiska od zera sprowadza
się do wskazania tego pliku, a nie do odtwarzania z pamięci, co było wyklikane
w panelu.

## Jak to jest poskładane

```
push na main
   │
   ├─► CI ──────────► lint · tsc · Vitest (PostgreSQL jako usługa) · Playwright · build obrazu
   │                     │
   │                     └─ zielone?
   │                          │
   └─────────────────────────►├─► migracje bazy (prisma migrate deploy)
                              └─► wywołanie wdrożenia na Render
                                     │
                                     └─► oczekiwanie na /api/health

co 30 min ─► Harmonogram KSeF ─► POST /api/ksef/scheduled-run
```

Dwie rzeczy w tym układzie są celowe i warto je znać.

**Migracje idą z CI, nie ze startu kontenera.** Nowa wersja aplikacji nie może
wystartować na starym schemacie, więc zmiana bazy musi poprzedzać przełączenie
ruchu. Obraz uruchomieniowy nie zawiera Prisma CLI, co oszczędza około 215 MB —
za cenę tego, że **wdrożenie wyklikane ręcznie w panelu Render pominie
migracje**. Schemat zmieniamy wyłącznie przez CI.

**Harmonogram wywołuje zewnętrzny wyzwalacz.** Aplikacja ma własny cron
(`src/server/cron.ts`), ale darmowa instancja Render usypia po okresie
bezczynności, a uśpiony proces nie odpali zadania. Na produkcji stoi więc
`KSEF_SCHEDULER=off`, a przebiegi wywołuje GitHub Actions, uderzając
w `/api/ksef/scheduled-run`. Godziny nadal ustawia użytkownik w interfejsie —
endpoint sam sprawdza, czy bieżąca minuta mieści się w harmonogramie
zapisanym w bazie. To jest praktyczna wypłata z wcześniejszej decyzji
o oddzieleniu wyzwalacza od logiki pobierania.

## Konfiguracja krok po kroku

### 1. Render

1. Załóż konto i wybierz **New → Blueprint**.
2. Podłącz repozytorium `SystemFaktur`. Render odczyta `render.yaml` i utworzy
   dwie rzeczy: bazę `lexalpha-db` i usługę webową `lexalpha`.
3. Przy pierwszym wdrożeniu Render zapyta o zmienne oznaczone `sync: false` —
   uzupełnij `KSEF_NIP`, `KSEF_TOKEN` i `SCHEDULER_TOKEN` (wartości znajdziesz
   w lokalnym `.env.local`; token harmonogramu możesz wygenerować na nowo przez
   `openssl rand -base64 24`).
4. W ustawieniach usługi znajdź **Deploy Hook** i skopiuj adres URL.
5. W ustawieniach bazy skopiuj **External Database URL**.

> Baza w planie darmowym wygasa po 30 dniach. Przy oddawaniu zadania warto
> sprawdzić datę, żeby link nie przestał działać w najgorszym momencie.

### 2. Sekrety i zmienne w GitHubie

`Settings → Secrets and variables → Actions`:

| Rodzaj   | Nazwa                     | Wartość                                   |
| -------- | ------------------------- | ----------------------------------------- |
| Secret   | `PRODUCTION_DATABASE_URL` | External Database URL z Render            |
| Secret   | `RENDER_DEPLOY_HOOK`      | Deploy Hook URL z Render                  |
| Secret   | `SCHEDULER_TOKEN`         | ta sama wartość co w Render               |
| Variable | `APP_URL`                 | np. `https://lexalpha.onrender.com`       |

Sekrety trafiają wyłącznie tutaj i do panelu Render. Zadanie wymaga wprost,
żeby poświadczenia KSeF nie znajdowały się w repozytorium ani po stronie
frontendu — dotyczy to również wersji wdrożonej.

### 3. Pierwsze wdrożenie

Migracji na pustej bazie nie ma jeszcze czego wywołać z CI, więc pierwszy raz
uruchom je ręcznie:

```bash
DATABASE_URL="<External Database URL>" npx prisma migrate deploy
DATABASE_URL="<External Database URL>" npx prisma db seed   # dane demonstracyjne
```

Potem wypchnij zmiany na `main`. CI przejdzie, wdrożenie ruszy samo.

### 4. Sprawdzenie

```bash
curl https://<adres>/api/health
# {"status":"ok","database":"up","latencyMs":...}
```

Sonda odpytuje bazę, a nie tylko potwierdza, że proces żyje — zielona odpowiedź
oznacza działającą aplikację, nie sam uruchomiony kontener.

## Znane ograniczenia darmowego planu

- **Instancja usypia** po około 15 minutach bez ruchu. Pierwsze wejście po
  przerwie trwa kilkadziesiąt sekund. Dlatego harmonogram jest zewnętrzny.
- **Jedna replika.** Mechanizmy odporności na współbieżność (unikalny indeks
  deduplikacji, klucz `(jobName, scheduledFor)` w historii przebiegów) są
  napisane i przetestowane pod wiele replik, ale na tym planie nie mają okazji
  się wykazać.
- **Baza wygasa po 30 dniach.**

## Uruchomienie lokalne

```bash
docker compose up          # baza, migracje, aplikacja — jedną komendą
```

albo, do pracy nad kodem:

```bash
docker compose up -d db
npm run db:migrate && npm run db:seed
npm run dev
```
