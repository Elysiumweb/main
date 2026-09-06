import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "build/**",
      "coverage/**",
      "node_modules/**",
      "functions/node_modules/**",
      "public/brand/elysium-press-kit.zip",
    ],
  },
  {
    files: ["src/**/*.{js,jsx}", "scripts/**/*.mjs", "tests/**/*.js", "tests/**/*.cjs", "craco.config.js", "playwright.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
