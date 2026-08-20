import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pływająca plakietka „N” w rogu ekranu to wskaźnik Next.js Dev Tools —
  // element narzędzi deweloperskich, nie interfejsu aplikacji.
  devIndicators: false,

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
