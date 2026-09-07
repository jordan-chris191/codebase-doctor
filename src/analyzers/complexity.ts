import ts from "typescript";

/**
 * Deterministic cyclomatic complexity for a source file.
 *
 * The metric is the conventional McCabe measure for a single function-plus-
 * entry-point program extended to the whole file:
 *
 *   complexity = 1 + (number of independent decision points)
 *
 * Every construct below is a branch point that adds one exit path:
 *
 * - `if`, `else if` (each `if` is a distinct branch)
 * - loops: `for`, `for-in`, `for-of`, `while`, `do-while`
 * - `switch`: one per case (excluding the `default` label)
 * - conditional expressions `a ? b : c`
 * - logical operators `&&` and `||`
 * - `catch` clauses (`try` without `catch` adds nothing, matching the
 *   conventional `M = E − N + 2P` treatment of try/catch)
 *
 * The baseline is 1, so an empty/simple file has complexity 1. The metric is
 * purely syntactic — it never type-checks and never varies with compiler
 * configuration — so the same content always yields the same value.
 */

/** Compute the cyclomatic complexity of a source file. */
export function computeComplexity(sourceFile: ts.SourceFile): number {
  let complexity = 1;

  sourceFile.forEachChild(function visit(node: ts.Node): void {
    if (ts.isIfStatement(node)) {
      complexity += 1;
    } else if (
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node)
    ) {
      complexity += 1;
    } else if (ts.isSwitchStatement(node)) {
      // Each `case` (not `default`) is an independent path.
      const nonDefault = node.caseBlock.clauses.filter((c) => !ts.isDefaultClause(c));
      complexity += nonDefault.length;
    } else if (ts.isConditionalExpression(node)) {
      complexity += 1;
    } else if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.AmpersandAmpersandToken || kind === ts.SyntaxKind.BarBarToken) {
        complexity += 1;
      }
    } else if (ts.isCatchClause(node)) {
      complexity += 1;
    }

    node.forEachChild(visit);
  });

  return complexity;
}
