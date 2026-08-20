import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Katalog budowania da się przestawić zmienną środowiskową. Testy e2e
  // uruchamiają własny serwer i bez tego pisałyby do tego samego `.next`,
  // co serwer deweloperski — dwa procesy nadpisujące sobie chunki kończą się
  // błędami "Module not found" w losowych miejscach.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Obraz produkcyjny kopiuje wyłącznie `.next/standalone` — Next dokłada tam
  // sam serwer i te zależności z node_modules, które są faktycznie używane.
  // Bez tego obraz ciągnąłby cały katalog node_modules razem z narzędziami
  // deweloperskimi.
  output: "standalone",

  // Pływająca plakietka „N” w rogu ekranu to wskaźnik Next.js Dev Tools —
  // element narzędzi deweloperskich, nie interfejsu aplikacji.
  devIndicators: false,

  // Testy e2e uderzają w serwer deweloperski po 127.0.0.1, a Next traktuje to
  // jako inne źródło niż `localhost`.
  allowedDevOrigins: ["127.0.0.1"],

  // Sterownik `pg` i `node-cron` sięgają po moduły natywne Node (`fs`,
  // `pg-native`). Bundlowane przez webpack rozsypują się na etapie budowania —
  // zwłaszcza gdy wejdą do grafu przez `instrumentation.ts`, które jest
  // kompilowane razem z aplikacją. Zostawiamy je jako zależności zewnętrzne.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "node-cron"],

  // `serverExternalPackages` nie obejmuje bundla `instrumentation.ts`, a ten
  // wciąga `node-cron`, który importuje `node:crypto` — schemat `node:` wywraca
  // budowanie webpackiem. Zależności wymagające runtime'u Node wypychamy więc
  // z grafu jawnie, dla wszystkich bundli serwerowych.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "node-cron", "pg", "@prisma/adapter-pg"];
    }
    return config;
  },
};

export default nextConfig;
