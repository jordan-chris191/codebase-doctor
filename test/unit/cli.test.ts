import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli.js";

describe("CLI", () => {
  it("defines the expected commands", () => {
    const program = buildProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain("scan");
  });

  it("reports the package version", () => {
    const program = buildProgram();
    expect(program.version()).toBe("0.1.0");
  });
});
