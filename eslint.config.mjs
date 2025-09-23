import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Base Next.js + TypeScript rules
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Global rules + ignores
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "**/*.tsbuildinfo",
      "prisma/**/generated/**",
    ],
    rules: {
      // Keep warnings but reduce noise for intentionally unused vars/args
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Tests: relax a few rules commonly noisy in tests
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "react/no-unescaped-entities": "off",
    },
  },
  // Scripts and tooling: allow more pragmatic typing/console usage
  {
    files: ["scripts/**/*.{ts,tsx,js,jsx}", "*.config.{ts,js,mjs,cjs}", "**/jest*.{ts,js}", "**/postcss.config.mjs"],
    languageOptions: {
      globals: { node: true },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  // Types: allow explicit any in type definition modules
  {
    files: ["src/types/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // API routes: relax typing and unused vars for handler signatures, allow pragmatic code
  {
    files: ["src/app/api/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Library services: allow explicit any for pragmatic service integrations
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default eslintConfig;
