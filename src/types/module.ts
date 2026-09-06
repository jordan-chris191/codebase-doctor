/**
 * A module represents a single source file and the symbols it exposes.
 * The module is the lowest level of architectural abstraction — files,
 * modules, and packages all build on top of it.
 */
export interface Module {
  /** Absolute paths to the files that form this module (usually one). */
  readonly id: string;
  /** Path relative to the repository root. */
  readonly path: string;
  /** Symbolion exposed by this module. */
  readonly exports: ModuleExport[];
}

/** A symbol (function, class, type, etc.) exposed by a module. */
export interface ModuleExport {
  /** The exported name. */
  readonly name: string;
  /** What kind of symbol is being exported. */
  readonly kind: ExportKind;
  /** Whether it is a default export. */
  readonly isDefault: boolean;
  /** Whether it is a re-export of a symbol from another module. */
  readonly isReExport: boolean;
}

/** The kinds of symbols a module can export. */
export type ExportKind = "function" | "class" | "type" | "constant" | "enum" | "interface";

/** A module's relationship to other modules. */
export interface ModuleReference {
  /** The exact import/require source string. */
  readonly source: string;
  /** Whether the source is relative (internal) or a package name (external). */
  readonly kind: "internal" | "external";
  /** Imported names, as written. */
  readonly imports: readonly string[];
  /** What was imported. */
  readonly type: ImportType;
}

export type ImportType = "static" | "type-only" | "dynamic" | "commonjs" | "side-effect";
