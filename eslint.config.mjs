import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["CHANGELOG.md", "dist-electron/**", "dist/**", "release/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "import-x": importPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TODO(fix/react-hooks-violations): eslint-plugin-react-hooks 7.1에서
      // 새로 추가된 두 룰이 기존 코드의 hook 패턴 14건을 잡아낸다.
      // eslint v10 업그레이드와 코드 수정 PR을 분리하기 위해 임시 off.
      // 별도 PR에서 위반 정리 후 이 두 줄 삭제할 것.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "object",
            "type",
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
            },
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import-x/first": "error",
      "import-x/newline-after-import": ["error", { count: 1 }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='store'][object.name=/^(context|appContext)$/]",
          message:
            "Direct access to context.store is restricted. Use context.getConfig() instead to respect dev:test overrides.",
        },
        {
          selector:
            "MemberExpression[property.name='store'][object.property.name='context'][object.object.type='ThisExpression']",
          message:
            "Direct access to this.context.store is restricted. Use this.context.getConfig() instead.",
        },
        {
          selector: "TSImportType",
          message:
            "Don't use inline import(...).Type. Import the type at the top of the file instead.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../store",
              importNames: ["setConfig", "deleteConfig"],
              message:
                "CONFIRMED: Use 'setConfigWithEvent' or 'deleteConfigWithEvent' from 'utils/config-utils' to ensure UI updates.",
            },
            {
              name: "../../store",
              importNames: ["setConfig", "deleteConfig"],
              message:
                "CONFIRMED: Use 'setConfigWithEvent' or 'deleteConfigWithEvent' from 'utils/config-utils' to ensure UI updates.",
            },
            {
              name: "./store",
              importNames: ["setConfig", "deleteConfig"],
              message:
                "CONFIRMED: Use 'setConfigWithEvent' or 'deleteConfigWithEvent' from 'utils/config-utils' to ensure UI updates.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      "import-x": importPlugin,
    },
    rules: {
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "object",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "import-x/newline-after-import": ["error", { count: 1 }],
    },
  },
  prettier,
];
