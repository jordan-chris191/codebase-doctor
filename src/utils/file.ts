import { posix } from "node:path";
import type { Language } from "../types/language.js";

/** Test-suffix patterns matched against the file's basename. */
const TEST_SUFFIXES = [".test.", ".spec."] as const;

/** Whether a file is a test file based on its basename. */
export function isTestFile(filePath: string): boolean {
  const base = posix.basename(filePath);
  return TEST_SUFFIXES.some((suffix) => base.includes(suffix));
}

/** Whether a path is a config file based on its basename. */
export function isConfigFile(filePath: string): boolean {
  const base = posix.basename(filePath).toLowerCase();
  return CONFIG_BASENAMES.has(base) || (base.startsWith(".") && base.endsWith("rc"));
}

/** A map of all known config basenames, lowercased. */
export const CONFIG_BASENAMES: ReadonlySet<string> = new Set<string>([
  // JS/TS build + package tooling
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.test.json",
  "tsconfig.node.json",
  ".babelrc",
  "babel.config.js",
  "babel.config.cjs",
  "babel.config.json",
  "webpack.config.js",
  "webpack.config.cjs",
  "webpack.config.mjs",
  "webpack.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "rollup.config.js",
  "rollup.config.mjs",
  "rollup.config.ts",
  "esbuild.config.js",
  "esbuild.config.mjs",
  "esbuild.config.ts",
  // Linters / formatters
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.json",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  ".stylelintrc",
  ".stylelintrc.json",
  ".stylelintrc.yaml",
  ".stylelintrc.yml",
  "biome.json",
  ".eta",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  // JS/TS miscellaneous
  "jsconfig.json",
  "tsconfig.eslint.json",
  "tsconfig.lint.json",
  "jsr.json",
  "deno.json",
  // Test tooling
  "vitest.config.ts",
  "vitest.config.mjs",
  "vitest.config.js",
  "vitest.workspace.ts",
  "jest.config.js",
  "jest.config.cjs",
  "jest.config.mjs",
  "jest.config.ts",
  "playwright.config.ts",
  "playwright.config.js",
  // CI
  ".github/workflows/build.yml",
  ".github/workflows/ci.yml",
]);

/** Detect the language of a supported source file, if any. */
export function languageForPath(filePath: string): Language | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return "typescript-jsx";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".jsx")) return "javascript-jsx";
  if (lower.endsWith(".js")) return "javascript";
  return null;
}
