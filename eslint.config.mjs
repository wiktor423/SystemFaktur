import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // Katalog budowania testów e2e i artefakty Playwrighta — kod generowany,
      // nie nasz.
      ".next-e2e/**",
      "test-results/**",
      "playwright-report/**",
      // Klient Prismy powstaje z `prisma generate`.
      "src/generated/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
