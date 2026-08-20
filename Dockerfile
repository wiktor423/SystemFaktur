# syntax=docker/dockerfile:1

# Obraz produkcyjny modułu faktur.
#
# Trzy etapy, żeby do finalnego obrazu nie trafiły ani źródła, ani zależności
# deweloperskie, ani — co ważniejsze — sekrety. Konfiguracja wchodzi wyłącznie
# zmiennymi środowiskowymi w czasie uruchomienia; `.dockerignore` pilnuje, żeby
# pliki `.env` nie stały się warstwą obrazu.

ARG NODE_VERSION=22-alpine

# --- Zależności --------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Prisma potrzebuje OpenSSL do silnika migracji.
RUN apk add --no-cache openssl

# Najpierw manifesty, potem reszta źródeł — dzięki temu warstwa z `npm ci`
# unieważnia się dopiero przy zmianie zależności, a nie przy każdej zmianie kodu.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# `npm ci` uruchamia `postinstall`, czyli `prisma generate`. Generator wymaga
# schematu, stąd skopiowanie `prisma/` wcześniej.
RUN npm ci

# --- Budowanie ---------------------------------------------------------------
FROM deps AS builder
WORKDIR /app

COPY . .

# Klient Prismy generuje się do `src/generated`, który jest poza repozytorium.
RUN npx prisma generate
RUN npm run build

# --- Migracje i seed ---------------------------------------------------------
# Osobny obraz, bo migracje muszą pójść PRZED startem nowej wersji aplikacji.
# Wpięcie ich w `CMD` serwera oznaczałoby, że przy trzech replikach trzy procesy
# ruszają na migracje jednocześnie.

# Przycięcie zależności musi mieć własny etap: `rm -rf` w warstwie nad `deps`
# tylko ukrywa pliki, a obraz nadal je niesie. Dopiero skopiowanie już
# przyciętego katalogu do czystej bazy realnie zmniejsza wynik.
FROM deps AS migrator-deps
# Migrator nie renderuje interfejsu — Next, React i biblioteki frontendu to
# kilkaset megabajtów, które nigdy nie zostaną wykonane, a przy każdym
# wdrożeniu jadą przez rejestr obrazów.
RUN rm -rf \
      node_modules/next node_modules/@next \
      node_modules/react node_modules/react-dom \
      node_modules/lucide-react \
      node_modules/tailwindcss node_modules/@tailwindcss \
      node_modules/eslint node_modules/@eslint node_modules/eslint-config-next

FROM node:${NODE_VERSION} AS migrator
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=migrator-deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
# Seed współdzieli definicje danych z aplikacją, więc potrzebuje źródeł.
COPY src ./src
# Załączniki demonstracyjne (przykładowy PDF i XML) seed wczytuje z dysku.
COPY public ./public

# Klient generujemy tutaj, zamiast liczyć na to, że przyjechał w `src/` z hosta.
RUN npx prisma generate

ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_ON_START\" = \"true\" ]; then npx prisma db seed; fi"]

# --- Obraz uruchomieniowy ----------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Aplikacja nie ma powodu działać jako root.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# `standalone` zawiera serwer i prześledzone zależności; `static` i `public`
# Next celowo zostawia obok, bo w większych wdrożeniach idą na CDN.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Sonda sprawdza połączenie z bazą, a nie samo to, że proces odpowiada —
# instancja bez bazy jest bezużyteczna i powinna zostać wymieniona.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
