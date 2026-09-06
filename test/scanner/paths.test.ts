import { describe, expect, it } from "vitest";
import { toPosixPath, toPosixRelativePath } from "../../src/utils/path.js";
import { isTestFile, isConfigFile } from "../../src/utils/file.js";

describe("toPosixPath", () => {
  it("converts backslash separators to slashes", () => {
    expect(toPosixPath("src\\components\\Button.tsx")).toBe("src/components/Button.tsx");
  });

  it("leaves already-posix paths unchanged", () => {
    expect(toPosixPath("src/components/Button.tsx")).toBe("src/components/Button.tsx");
  });
});

describe("toPosixRelativePath", () => {
  it("produces a posix relative path from an absolute-like target", () => {
    expect(toPosixRelativePath("C:/repo", "C:/repo/src/index.ts")).toBe("src/index.ts");
  });

  it("handles backslash targets on Windows-style roots", () => {
    expect(toPosixRelativePath("C:\\repo", "C:\\repo\\src\\index.ts")).toBe("src/index.ts");
  });

  it("returns '.' when target equals root", () => {
    expect(toPosixRelativePath("/repo", "/repo")).toBe(".");
  });

  it("returns the target unchanged if it is not under the root", () => {
    expect(toPosixRelativePath("/repo", "/elsewhere/file.ts")).toBe("/elsewhere/file.ts");
  });
});

describe("test file detection", () => {
  it("detects .test. and .spec. files", () => {
    expect(isTestFile("src/index.test.ts")).toBe(true);
    expect(isTestFile("src/utils/helpers.spec.js")).toBe(true);
  });

  it("does not flag ordinary source files", () => {
    expect(isTestFile("src/index.ts")).toBe(false);
    expect(isTestFile("src/contest.testing.ts")).toBe(false);
  });
});

describe("config file detection", () => {
  it("flags known config basenames (case-insensitive)", () => {
    expect(isConfigFile("package.json")).toBe(true);
    expect(isConfigFile("TSCONFIG.JSON")).toBe(true);
    expect(isConfigFile("vite.config.ts")).toBe(true);
  });

  it("flags dot-rc config files", () => {
    expect(isConfigFile(".eslintrc")).toBe(true);
    expect(isConfigFile(".npmrc")).toBe(true);
  });

  it("does not flag ordinary source", () => {
    expect(isConfigFile("src/index.ts")).toBe(false);
  });
});
