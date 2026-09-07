import ts from "typescript";
import { FileParseError } from "./errors.js";

/**
 * `SourceFile.parseDiagnostics` is populated during parsing with the token-
 * level syntactic diagnostics (e.g. `const = ;` → "Variable declaration
 * expected."). It is not part of the public type surface, but it is stable
 * compiler internals and far cheaper than building a full `Program` or
 * transpiling twice (which `transpileModule` would do). Read it through a
 * const assertion so tsc does not flag it.
 */
interface SourceFileWithParseDiagnostics {
  parseDiagnostics: readonly ts.Diagnostic[];
}

/**
 * Throw the project's `FileParseError` when the parser produced syntactic
 * diagnostics for `sourceFile`. Structural/semantic errors are NOT reported
 * here — Phase 1C is syntax/AST analysis only.
 */
export function ensureNoParseErrors(sourceFile: ts.SourceFile, filePath: string): void {
  const withDiagnostics = sourceFile as ts.SourceFile & SourceFileWithParseDiagnostics;
  const error = withDiagnostics.parseDiagnostics[0];
  if (error === undefined) {
    return;
  }
  const message = ts.flattenDiagnosticMessageText(error.messageText, " ");
  throw new FileParseError(filePath, new SyntaxError(message));
}
