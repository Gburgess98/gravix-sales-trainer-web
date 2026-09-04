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
      "out/**",
      "build/**",
      ".claude/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Foundation phase (Go Live Day 5): the WEB app carries ~620 pre-existing
      // `any` usages. Enforcing at error level would force an unsafe broad
      // refactor, so this is tracked as visible warning debt — matching the
      // explicit API lint policy (Go Live Day 4). It is NOT disabled; burn it
      // down in risk-ranked batches and promote back to error once bounded.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
