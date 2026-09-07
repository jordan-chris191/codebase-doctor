import ts from "typescript";
import type { ExportKind, ModuleExport } from "../types/module.js";

/**
 * Collect the exported symbols a source file declares, as `ModuleExport`.
 *
 * Handles: `export function/class/const/let/var/type/interface/enum/namespace`,
 * `export { a, b as c }` (local re-export), `export { a } from "./m"`,
 * `export type { a } from "./m"`, `export * as ns from "./m"`,
 * `export * from "./m"` (reference only), and default exports
 * (`export default function/class/anonymous/identifier`).
 *
 * Re-exports record the module specifier in `source` (else `null`) so
 * Phase 1D can build export edges without a second parse.
 */

/** Linked name for a declaration with no identifier (e.g. anonymous exports). */
const ANONYMOUS = "(anonymous)";

/** True when `node` carries an `export` modifier. */
function isExported(node: ts.Node): boolean {
  const modifiers = ts.getModifiers(node as ts.HasModifiers);
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** True when `node` carries the given modifier. */
function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.getModifiers(node as ts.HasModifiers);
  return modifiers?.some((m) => m.kind === kind) ?? false;
}

/** A plain, complete `ModuleExport`. */
function exportOf(
  name: string,
  kind: ExportKind,
  opts: { isTypeOnly?: boolean; isDefault?: boolean; source?: string | null } = {},
): ModuleExport {
  return {
    name,
    kind,
    isDefault: opts.isDefault ?? false,
    isReExport: opts.isTypeOnly ?? false,
    source: opts.source === undefined ? null : opts.source,
  };
}

/**
 * Map every top-level local declaration name to its `ExportKind`. Used to
 * classify `export { foo }` when `foo` is declared locally (vs. imported).
 */
function localNames(sourceFile: ts.SourceFile): Map<string, ExportKind> {
  const map = new Map<string, ExportKind>();
  sourceFile.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          map.set(declaration.name.text, "constant");
        }
      }
    } else if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "function");
    } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "class");
    } else if (ts.isEnumDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "enum");
    } else if (ts.isInterfaceDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "interface");
    } else if (ts.isTypeAliasDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "type");
    } else if (ts.isModuleDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "namespace");
    } else if (ts.isImportEqualsDeclaration(node) && node.name !== undefined) {
      map.set(node.name.text, "namespace");
    }
  });
  return map;
}

/** Module specifier of an export declaration, unquoted, or null. */
function specifierOf(node: ts.ExportDeclaration, sourceFile: ts.SourceFile): string | null {
  const specifier = node.moduleSpecifier;
  if (specifier === undefined) {
    return null;
  }
  const text = specifier.getText(sourceFile);
  return text.length >= 2 ? text.slice(1, -1) : text;
}

/** Collect every `ModuleExport` a source file declares (and members). */
export function collectExports(sourceFile: ts.SourceFile): { exports: ModuleExport[] } {
  const local = localNames(sourceFile);
  const exports: ModuleExport[] = [];

  sourceFile.forEachChild(function visit(node: ts.Node): void {
    // `export default function/class ...` — a declaration form, reported as a
    // default export. Named defaults use the declared name; anonymous ones use
    // the placeholder (no meaningful name exists in the AST).
    if (isExported(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
      const name = namedDeclaration(node) ?? ANONYMOUS;
      exports.push(exportOf(name, kindOfDeclaration(node), { isDefault: true }));
      return;
    }

    // `export const/function/class/interface/type/enum/namespace ...`
    if (isExported(node)) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            exports.push(exportOf(declaration.name.text, "constant"));
          }
        }
        return;
      }
      const name = namedDeclaration(node);
      if (name !== undefined) {
        exports.push(exportOf(name, kindOfDeclaration(node)));
      }
      return;
    }

    // `export { a }; export { a } from "./m"; export * as ns from "./m";`
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      const specifier = specifierOf(node, sourceFile);

      if (clause === undefined) {
        // `export * from "./m"` — reference only; no export name to report.
        return;
      }

      if (ts.isNamespaceExport(clause)) {
        exports.push(
          exportOf(clause.name.text, "namespace", {
            isTypeOnly: false,
            source: specifier,
          }),
        );
        return;
      }

      for (const element of clause.elements) {
        const isTypeOnly = node.isTypeOnly || element.isTypeOnly;
        // `name` is the exported name (`export { foo as bar }` → bar);
        // `propertyName` is the local name being re-exported.
        const exportedName = element.name.text;
        const localName = element.propertyName?.text ?? exportedName;
        const kind = isTypeOnly ? "type" : (local.get(localName) ?? "constant");
        exports.push(exportOf(exportedName, kind, { isTypeOnly, source: specifier }));
      }
      return;
    }

    // `export default <expression>` (not a declaration form).
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      const name = ts.isIdentifier(expr) ? expr.text : ANONYMOUS;
      exports.push(exportOf(name, kindOfExpression(expr), { isDefault: true }));
    }

    node.forEachChild(visit);
  });

  return { exports };
}

/** Name of an exported named declaration, or undefined if anonymout. */
function namedDeclaration(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isImportEqualsDeclaration(node)
  ) {
    return node.name?.text;
  }
  return undefined;
}

/** Map an exported named declaration to its `ExportKind`. */
function kindOfDeclaration(node: ts.Node): ExportKind {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isModuleDeclaration(node)) return "namespace";
  if (ts.isImportEqualsDeclaration(node)) return "namespace";
  return "constant";
}

/** Best-effort `ExportKind` for a default-exported expression. */
function kindOfExpression(expr: ts.Expression): ExportKind {
  if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) return "function";
  if (ts.isClassExpression(expr)) return "class";
  return "constant";
}
