import type { ModuleExport, ModuleReference } from "../types/module.js";

/**
 * Derive a short, deterministic, human-readable summary of a file's role from
 * the analysis we already computed. It is a plain descriptor, never
 * AI-generated, and never the source of truth for repository facts.
 */

/** A deterministic, sorted kind tally for the summary. */
function tallyExportsByKind(exports: readonly ModuleExport[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const exp of exports) {
    const key = exp.isDefault ? "default" : exp.kind;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return new Map([...tally.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

/** Number of distinct dependency sources referenced by this file. */
function distinctSources(references: readonly ModuleReference[]): number {
  return new Set(references.map((ref) => ref.source)).size;
}

/** Build a summary string from the extracted analysis data. */
export function buildSummary(
  exports: readonly ModuleExport[],
  references: readonly ModuleReference[],
  functions: readonly string[],
  classes: readonly string[],
): string {
  const parts: string[] = [];

  if (functions.length > 0) {
    parts.push(functions.length === 1 ? "1 function" : `${functions.length} functions`);
  }
  if (classes.length > 0) {
    parts.push(classes.length === 1 ? "1 class" : `${classes.length} classes`);
  }

  const byKind = tallyExportsByKind(exports);
  if (byKind.size > 0) {
    const kinds = [...byKind.entries()].map(([kind, count]) => {
      const plural = count === 1 ? kind : `${kind}s`;
      return `${count} ${plural}`;
    });
    parts.push(`exports ${kinds.join(", ")}`);
  }

  if (references.length > 0) {
    parts.push(`depends on ${distinctSources(references)} module(s)`);
  }

  if (parts.length === 0) {
    return "No detectable imports, exports, functions, or classes";
  }
  return parts.join("; ");
}
