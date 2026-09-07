import ts from "typescript";
import type { ModuleReference } from "../types/module.js";

/**
 * Collect the module references a source file declares: ES import/export
 * forms (static, type-only, side-effect, dynamic) and recognized CommonJS
 * `require()` calls. Module specifiers are captured exactly as written and
 * never resolved — resolution belongs to Phase 1D.
 */

/** The `require` identifier, for CommonJS detection. */
const REQUIRE_IDENTIFIER = "require";

/**
 * True when `node` is a call to the CommonJS `require` function with exactly
 * one string-literal argument. Anything else (member calls like
 * `foo.require("./x")`, zero/multiple args, non-literal args) is NOT a
 * CommonJS import so arbitrary calls are never misclassified.
 */
function isRequireCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (!ts.isIdentifier(callee) || callee.text !== REQUIRE_IDENTIFIER) {
    return false;
  }
  const [arg] = node.arguments;
  return arg !== undefined && ts.isStringLiteral(arg) && arg.text.length > 0;
}

/** Extract the references declared by one import declaration. */
function collectImportReference(
  node: ts.ImportDeclaration,
  sourceFile: ts.SourceFile,
): ModuleReference {
  const source = unquote(node.moduleSpecifier.getText(sourceFile));
  const clause = node.importClause;

  if (clause === undefined) {
    // `import "./setup";`
    return { source, kind: "internal", imports: [], type: "side-effect" };
  }

  if (clause.isTypeOnly) {
    // `import type { A } from "./m";` / `import type Def from "./m";`
    return { source, kind: "internal", imports: importedNames(clause), type: "type-only" };
  }

  return { source, kind: "internal", imports: importedNames(clause), type: "static" };
}

/** Extract the names imported by an import clause (if any are named). */
function importedNames(clause: ts.ImportClause): string[] {
  const names: string[] = [];

  const defaultName = clause.name;
  if (defaultName !== undefined) {
    names.push(defaultName.text);
  }

  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) {
    return names;
  }

  for (const element of bindings.elements) {
    names.push(element.name.text);
  }
  return names;
}

/**
 * Collect every module reference in the file by walking the AST once.
 * Both declaration positions (top level and nested, e.g. inside a function)
 * are visited. The absolute-path check keeps bare utility names such as
 * `require` or `Object` out of exports; it never affects import specifiers.
 */
export function collectReferences(sourceFile: ts.SourceFile): { references: ModuleReference[] } {
  const references: ModuleReference[] = [];

  sourceFile.forEachChild(function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      references.push(collectImportReference(node, sourceFile));
    } else if (ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined) {
        references.push({
          source: unquote(specifier.getText(sourceFile)),
          kind: "internal",
          imports: [],
          type: node.isTypeOnly ? "type-only" : "side-effect",
        });
      }
    } else if (ts.isImportTypeNode(node)) {
      // `import("./mod")` inside a type annotation — dynamic type import.
      const { argument } = node;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        references.push({
          source: unquote(argument.literal.text),
          kind: "internal",
          imports: [],
          type: "dynamic",
        });
      }
    } else if (ts.isCallExpression(node)) {
      if (isRequireCall(node)) {
        const [literal] = node.arguments;
        const source = literal !== undefined && ts.isStringLiteral(literal) ? literal.text : "";
        references.push({ source, kind: "internal", imports: [], type: "commonjs" });
      } else if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1
      ) {
        // `import("./mod")` — a dynamic import expression.
        const [literal] = node.arguments;
        if (literal !== undefined && ts.isStringLiteral(literal)) {
          references.push({
            source: literal.text,
            kind: "internal",
            imports: [],
            type: "dynamic",
          });
        }
      }
    }
    node.forEachChild(visit);
  });

  return { references };
}

/** Strip the surrounding quotes from a module specifier literal. */
function unquote(text: string): string {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1);
    }
  }
  return text;
}
