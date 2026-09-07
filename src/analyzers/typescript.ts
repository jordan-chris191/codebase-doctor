import ts from "typescript";
import { languageForPath } from "../utils/file.js";
import type { FileAnalysis, LanguageAnalyzer } from "./interfaces.js";
import { scriptKindForPath } from "./script-kind.js";
import { ensureNoParseErrors } from "./validation.js";
import { collectReferences } from "./imports.js";
import { collectExports } from "./exports.js";
import { collectSymbols } from "./symbols.js";
import { computeComplexity } from "./complexity.js";
import { buildSummary } from "./summary.js";

/**
 * The canonical Phase 1C analyzer: TypeScript Compiler API over one parsed
 * `SourceFile`. Deterministic and pure — it analyzes `content` in memory,
 * never touching disk, with the extension only choosing the grammar.
 *
 * Uses the TypeScript compiler API directly (per the Phase 1C decision) as
 * the single source of truth for imports, exports, functions, classes, and
 * complexity for TS/TSX/JS/JSX. The same AST drives Phase 1D later.
 */
export class TypeScriptAnalyzer implements LanguageAnalyzer {
  readonly name = "typescript";
  readonly languages = ["typescript", "typescript-jsx", "javascript", "javascript-jsx"] as const;

  /** Route supported extensions; reuses the project's language utility. */
  canHandle(filePath: string): boolean {
    return languageForPath(filePath) !== null;
  }

  /** Analyze one source file's content, returning its structure. */
  analyzeFile(filePath: string, content: string): FileAnalysis {
    const language = languageForPath(filePath);
    if (language === null) {
      throw new Error(
        `Unsupported language for file "${filePath}". Supported: TypeScript, TSX, JavaScript, JSX.`,
      );
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      scriptKindForPath(filePath),
    );

    // Token-level syntax errors → deterministic FileParseError. The caller
    // (a repo scan) catches it per-file; it must not crash the whole run.
    ensureNoParseErrors(sourceFile, filePath);

    const { references } = collectReferences(sourceFile);
    const { exports } = collectExports(sourceFile);
    const { functions, classes } = collectSymbols(sourceFile);
    const complexity = computeComplexity(sourceFile);
    const summary = buildSummary(exports, references, functions, classes);

    return {
      filePath,
      exports,
      references,
      complexity,
      functions,
      classes,
      summary,
    };
  }
}

/** Create a TypeScript/JavaScript analyzer. */
export function createTypeScriptAnalyzer(): TypeScriptAnalyzer {
  return new TypeScriptAnalyzer();
}

/** Namespace exports of the TypeScript compiler API, for Phase 1D reuse. */
export { ts };
