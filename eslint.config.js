import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      // Playwright specs aren't part of the app bundle and have their own
      // type/runtime story; lint them separately if/when desired.
      "e2e/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Vite + React 18 — JSX transform doesn't need React in scope.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // eslint-plugin-react-hooks 7.x adds React-19-flavored rules that
      // assume pure-functional state. Three of them conflict directly
      // with how this app integrates fabric.js (a mutable external
      // library) and with the standard ref-mirror pattern:
      //   - immutability: every fabric mutation (canvas.selection = …,
      //     canvas.on(…), canvas.defaultCursor = …) is a hook arg
      //     mutation; that's the entire integration surface.
      //   - refs: forbids `ref.current = x` during render, which is the
      //     documented way to mirror props into a ref (used by usePan).
      //   - set-state-in-effect: setCanvas(canvas) after fabric needs
      //     a real DOM node to construct it; it can't run earlier.
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
    settings: { react: { version: "detect" } },
  },
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Tests reach for `any` to mock fabric internals.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
