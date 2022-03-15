/**
 * This config is intended for internal Remix projects. It should not be
 * documented nor considered public API in regards to semver considerations.
 */

/**
 * @see https://github.com/eslint/eslint/issues/3458
 * @see https://www.npmjs.com/package/@rushstack/eslint-patch
 */
require("@rushstack/eslint-patch/modern-module-resolution");

const OFF = 0;
const WARN = 1;
const ERROR = 2;

module.exports = {
  root: true,
  extends: [
    require.resolve("./index.js"),
    require.resolve("./jest-testing-library.js"),
  ],
  env: {
    node: true,
  },
  plugins: [
    // Plugins used in the internal config should be installed in our
    // repositories. We don't want to ship these as dependencies to consumers
    // who may not use them.
    "node",
    "prefer-let",
  ],
  rules: {
    "@typescript-eslint/consistent-type-imports": ERROR,
    "import/order": [
      ERROR,
      {
        "newlines-between": "always",
        groups: [
          ["builtin", "external", "internal"],
          ["parent", "sibling", "index"],
        ],
      },
    ],
    "jest/no-disabled-tests": OFF,
    "prefer-let/prefer-let": WARN,
  },
  overrides: [
    {
      // all code blocks in .md files
      files: ["**/*.md/*.js?(x)", "**/*.md/*.ts?(x)"],
      rules: {
        "no-unreachable": OFF,
        "no-unused-expressions": OFF,
        "no-unused-labels": OFF,
        "no-unused-vars": OFF,
        "jsx-a11y/alt-text": OFF,
        "jsx-a11y/anchor-has-content": OFF,
        "prefer-let/prefer-let": OFF,
        "react/jsx-no-comment-textnodes": OFF,
        "react/jsx-no-undef": OFF,
      },
    },
    {
      // all ```ts & ```tsx code blocks in .md files
      files: ["**/*.md/*.ts?(x)"],
      rules: {
        "@typescript-eslint/no-unused-expressions": OFF,
        "@typescript-eslint/no-unused-vars": OFF,
      },
    },
    {
      files: [
        // All examples and docs, including code blocks in .md files
        "examples/**/*.js?(x)",
        "examples/**/*.ts?(x)",
      ],
      rules: {
        "import/order": OFF,
        "no-unused-expressions": OFF,
        "no-unused-labels": OFF,
        "no-unused-vars": OFF,
        "prefer-let/prefer-let": OFF,
      },
    },
  ],
};
