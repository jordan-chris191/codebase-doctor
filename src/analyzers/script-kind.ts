import ts from "typescript";

/**
 * Map a supported source extension to the compiler's `ScriptKind`, so each
 * language parses with the correct grammar:
 *
 * - `.ts`  → `TS`
 * - `.tsx` → `TSX`
 * - `.js`  → `JS`
 * - `.jsx` → `JSX`
 *
 * Unsupported extensions return `undefined` (the analyzer's `canHandle` uses
 * `languageForPath`, so this only receives supported paths).
 */
export function scriptKindForPath(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}
