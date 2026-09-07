import ts from "typescript";

/**
 * Extract the functions and classes a source file declares, as the simple
 * name lists the `FileAnalysis` contract requires.
 *
 * Collects the *names* of declared functions (function declarations and named
 * function expressions, anywhere in the file — including nested scopes) and
 * classes (class declarations). Arrows and anonymous functions have no name
 * and are not listed (the variable holding an arrow is a `constant`, captured
 * by the exports/const analysis). Class methods are deliberately not listed:
 * `classes` is about discovery, and a method belongs to its class rather than
 * being a standalone module function. Methods still contribute to complexity.
 */

/** Collect function names (declared only) and class names. */
export function collectSymbols(sourceFile: ts.SourceFile): {
  functions: string[];
  classes: string[];
} {
  const functionNames = new Set<string>();
  const classNames = new Set<string>();

  sourceFile.forEachChild(function visit(node: ts.Node): void {
    // Class members are not descended into for function names, but the class
    // name itself is collected. (Function members of a class are methods.)
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      if (node.name !== undefined) {
        classNames.add(node.name.text);
      }
      // Do not descend: methods are not module functions.
      return;
    }

    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      if (node.name !== undefined) {
        functionNames.add(node.name.text);
      }
      // Descend into the body so nested `function` declarations are found.
      node.forEachChild(visit);
      return;
    }

    // Arrows have no name; nothing to record. Descent happens below so nested
    // named functions inside an arrow body are still found.
    node.forEachChild(visit);
  });

  return {
    functions: sortedUnique(functionNames),
    classes: sortedUnique(classNames),
  };
}

/** Deterministic ordering for the name lists. */
function sortedUnique(names: ReadonlySet<string>): string[] {
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
