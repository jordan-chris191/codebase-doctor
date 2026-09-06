/** Programming language identifiers. */
export type Language = "typescript" | "typescript-jsx" | "javascript" | "javascript-jsx";

/**
 * File extensions mapped to their language.
 * Deep-frozen: this is a constant lookup table — never mutate it.
 */
export const LANGUAGES: ReadonlyArray<{ extension: string; language: Language }> = Object.freeze([
  Object.freeze({ extension: ".ts", language: "typescript" }),
  Object.freeze({ extension: ".tsx", language: "typescript-jsx" }),
  Object.freeze({ extension: ".js", language: "javascript" }),
  Object.freeze({ extension: ".jsx", language: "javascript-jsx" }),
]);
