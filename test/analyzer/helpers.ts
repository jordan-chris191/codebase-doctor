import { createTypeScriptAnalyzer } from "../../src/analyzers/typescript.js";
import type { FileAnalysis } from "../../src/analyzers/interfaces.js";

/**
 * Shared fixture builder for analyzer tests: analyze `content` as a file with
 * the given (extension-bearing) name and return the resulting FileAnalysis.
 * The analyzer is deterministic, so the same inputs always produce the same
 * output.
 */
const analyzer = createTypeScriptAnalyzer();

export function analyze(name: string, content: string): FileAnalysis {
  return analyzer.analyzeFile(name, content);
}
