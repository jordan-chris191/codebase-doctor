import { join, normalize, resolve as resolvePath } from "node:path";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import ts from "typescript";
import { toPosixRelativePath } from "../utils/path.js";
import { ALWAYS_EXCLUDED_SET } from "../utils/always-excluded.js";
import type { DependencyClassification } from "../types/dependency.js";

/**
 * Repository-aware module resolution for Phase 1D.
 *
 * Uses the TypeScript Compiler API (`ts.resolveModuleName`) — the same engine
 * Phase 1C uses — to resolve module specifiers to concrete absolute file
 * paths, honoring `tsconfig.json` (`baseUrl`, `paths`, module resolution
 * mode) when present. This layer never re-parses source files; it consumes
 * the `ModuleReference`/`ModuleExport.source` values Phase 1C already produced
 * and classifies each into `internal` / `external` / `unresolved`.
 */

/** The resolution classification of a reference. */
export type ResolutionKind = DependencyClassification;

/** A successfully resolved reference. */
export interface ResolvedTarget {
  readonly kind: "internal" | "external";
  /** Absolute path of the resolved file. */
  readonly absolutePath: string;
  /** True when TypeScript resolved this from `node_modules` (a package). */
  readonly isExternalLibrary: boolean;
}

/** A reference that could not be resolved. */
export interface UnresolvedTarget {
  readonly kind: "unresolved";
  /** The reason resolution failed, if the resolver can say why. */
  readonly reason: string | null;
}

/** Union result of `resolveReference`. */
export type ResolveResult = ResolvedTarget | UnresolvedTarget;

/** The repository-aware module resolver. */
export interface ModuleResolver {
  /** Root of the analyzed repository (absolute, canonical). */
  readonly rootPath: string;
  /** Resolve a single reference originating at `fromAbsolutePath`. */
  resolveReference(specifier: string, fromAbsolutePath: string): ResolveResult;
}

/** Errors raised by dependency analysis (malformed config, bad input). */
export class DependencyAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencyAnalysisError";
  }
}

/** Options for creating a resolver. */
export interface ResolverOptions {
  /**
   * Explicit path to a tsconfig to parse. Defaults to discovering
   * `<root>/tsconfig.json` if it exists.
   */
  tsconfigPath?: string;
}

/** Filesystem access for the TypeScript resolution host. */
interface ResolutionFs {
  fileExists(filePath: string): boolean;
  directoryExists(dirPath: string): boolean;
  readFile(filePath: string): string | undefined;
  realpath(filePath: string): string;
}

/** The repo root, canonicalized once. */
function canonicalRoot(rootPath: string): string {
  return resolvePath(normalize(rootPath));
}

/** Discover a tsconfig — the conventional `<root>/tsconfig.json`, or the
 * explicit path if given. (Project references are out of scope for 1D.) */
function discoverTsconfig(rootPath: string, explicit?: string): string | null {
  if (explicit !== undefined) {
    return explicit;
  }
  const candidate = join(rootPath, "tsconfig.json");
  return existsSync(candidate) ? candidate : null;
}

/** Parse a tsconfig into `CompilerOptions`, returning null when absent. */
function compilerOptionsFor(
  tsconfigPath: string | null,
  rootPath: string,
  fs: ResolutionFs,
): ts.CompilerOptions | null {
  if (tsconfigPath === null) {
    return null;
  }
  const text = fs.readFile(tsconfigPath);
  if (text === undefined) {
    return null;
  }
  const loaded = ts.parseConfigFileTextToJson(tsconfigPath, text);
  if (loaded.error !== undefined || loaded.config === undefined) {
    return null;
  }
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    {
      ...ts.sys,
      readFile: (p) => fs.readFile(p) ?? ts.sys.readFile(p) ?? "",
      fileExists: (p) => fs.fileExists(p) ?? ts.sys.fileExists(p),
      directoryExists: (p) => fs.directoryExists(p) ?? ts.sys.directoryExists(p),
    },
    rootPath,
  );
  return parsed.options ?? null;
}

/** Default compiler options when the repo has no tsconfig. */
function defaultOptions(): ts.CompilerOptions {
  return {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    allowJs: true,
    resolveJsonModule: true,
  };
}

/** Build the filesystem host used by `ts.resolveModuleName`. */
function resolutionHost(rootPath: string): ResolutionFs & {
  useCaseSensitiveFileNames: boolean;
  getCurrentDirectory: () => string;
} {
  return {
    fileExists: (p) => fileExists(p),
    readFile: (p) => readFileUtf8(p),
    directoryExists: (p) => dirExists(p),
    realpath: (p) => realpathSync(p),
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => rootPath,
  };
}

// Small FS helpers wrapping node (throw-free).
function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function readFileUtf8(p: string): string | undefined {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
}

/** Whether an absolute path resolves inside the repo root. */
function isPathInsideRoot(absolute: string, rootPath: string): boolean {
  const rel = toPosixRelativePath(rootPath, absolute);
  return absolute !== rootPath && !rel.startsWith("..") && !rel.startsWith("/");
}

/** Where a resolved file lives relative to the repo (never `unresolved`). */
function classifyResolved(
  absolutePath: string,
  rootPath: string,
  isExternalLibrary: boolean,
): "internal" | "external" {
  // TypeScript says it's a package (node_modules) → external.
  if (isExternalLibrary) {
    return "external";
  }
  // Resolved inside the repo root → internal, unless under an always-excluded
  // dir (the scanner would not list such a file as a node anyway).
  if (isPathInsideRoot(absolutePath, rootPath)) {
    const rel = toPosixRelativePath(rootPath, absolutePath);
    const top = rel.split("/")[0] ?? "";
    if (ALWAYS_EXCLUDED_SET.has(top)) {
      return "external";
    }
    return "internal";
  }
  // Outside the repo root (e.g. a workspace sibling) → external.
  return "external";
}

/** Implement the resolver. */
export function createModuleResolver(
  rootPath: string,
  options: ResolverOptions = {},
): ModuleResolver {
  const canonical = canonicalRoot(rootPath);
  const tsconfigPath = discoverTsconfig(canonical, options.tsconfigPath);
  const fs = resolutionHost(canonical);
  const compilerOptions = compilerOptionsFor(tsconfigPath, canonical, fs) ?? defaultOptions();

  return {
    rootPath: canonical,
    resolveReference(specifier, fromAbsolutePath): ResolveResult {
      try {
        const resolved = ts.resolveModuleName(
          specifier,
          fromAbsolutePath,
          compilerOptions,
          fs as ts.ModuleResolutionHost,
        );
        const module = resolved.resolvedModule;
        if (module === undefined) {
          return { kind: "unresolved", reason: "no resolved module for specifier" };
        }
        const absolute = resolvePath(normalize(module.resolvedFileName));
        const kind = classifyResolved(absolute, canonical, module.isExternalLibraryImport === true);
        return {
          kind,
          absolutePath: absolute,
          isExternalLibrary: module.isExternalLibraryImport === true,
        };
      } catch {
        return { kind: "unresolved", reason: "resolution threw" };
      }
    },
  };
}
