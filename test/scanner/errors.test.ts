import { afterAll, describe, expect, it } from "vitest";
import { createScanner } from "../../src/scanner/scanner.js";
import { PathIsFileError, PathNotFoundError, ScanError } from "../../src/scanner/errors.js";
import { join, makeFixtureRepo, runCleanups, trackCleanup } from "../helpers/fs.js";

const scanner = createScanner();

afterAll(async () => {
  await runCleanups();
});

describe("scanner error handling", () => {
  it("throws PathNotFoundError for a nonexistent path", async () => {
    await expect(scanner.scan("N:/definitely/not/a/repo")).rejects.toThrow(PathNotFoundError);
  });

  it("throws a structured ScanError with a useful message", async () => {
    try {
      await scanner.scan("N:/definitely/not/a/repo");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ScanError);
      if (err instanceof PathNotFoundError) {
        expect(err.message).toMatch(/not found/i);
      }
    }
  });

  it("throws PathIsFileError when the path resolves to a file", async () => {
    const fixture = await makeFixtureRepo({ "file.txt": "hello\n" });
    trackCleanup(fixture.cleanup);
    await expect(scanner.scan(join(fixture.root, "file.txt"))).rejects.toThrow(PathIsFileError);
  });
});
