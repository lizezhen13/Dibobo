import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", ".cache/**", ".codex-build-check*/**", "coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // These rules are useful diagnostics, but several intentional synchronization
      // effects and third-party hooks in this application cannot be rewritten as pure
      // render logic without changing behavior.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // React Compiler is not enabled in this Vite app yet; TanStack Table and
      // React Hook Form intentionally expose APIs that the compiler cannot memoize.
      "react-hooks/incompatible-library": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      // Radix primitive exports (Root, Trigger, Close) are part of each UI module's API.
      "react-refresh/only-export-components": "off",
    },
  },
);
