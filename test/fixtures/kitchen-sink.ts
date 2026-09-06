import { makeFixtureRepo } from "../helpers/fs.js";

/**
 * The canonical "kitchen sink" fixture: exercises nested directories,
 * all four source extensions, config/test/doc files, every always-excluded
 * dir, gitignore rules, and an unsupported file.
 *
 * Returns a builder so tests can vary the `.gitignore` per case.
 */
export async function kitchenSinkFixture(
  gitignore: string,
): Promise<ReturnType<typeof makeFixtureRepo>> {
  return makeFixtureRepo({
    // .git exists (a git repo marker)
    ".git/HEAD": "ref: refs/heads/main\n",

    // Nested source files, all four extensions
    "src/index.ts": "export function sum(a: number, b: number) { return a + b; }\n",
    "src/utils/helpers.ts": "export const PI = 3.14;\n",
    "src/utils/format.ts": "export function fmt(n: number) { return n.toFixed(2); }\n",
    "src/components/Button.tsx":
      "export const Button = ({ label }: { label: string }) => <button>{label}</button>;\n",
    "legacy/old.js": "module.exports = function old() { return 1; };\n",
    "legacy/Component.jsx": "export const C = () => <div />;\n",

    // Test files
    "src/index.test.ts":
      "import { sum } from './index'; describe('sum', () => { it('adds', () => { expect(sum(1,2)).toBe(3); }); });\n",
    "src/utils/helpers.spec.js": "const h = require('./helpers');\n",

    // Config files
    "package.json": '{"name":"fixture"}\n',
    "tsconfig.json": '{"compilerOptions":{}}\n',

    // Documentation / fixtures / unsupported
    "README.md": "# Fixture\n\nDocs.\n",
    "docs/spec.md": "Spec\n",
    "test/__fixtures__/data.json": "{}\n",
    "data.csv": "a,b\n1,2\n",

    // Always-excluded dirs (with a source file inside each)
    "node_modules/pkg/index.js": "module.exports = {};\n",
    "dist/main.js": "// built\n",
    "build/out.js": "// built\n",
    "coverage/lcov.info": "SF:src/index.ts\n",
    ".codebase-doctor/scan.json": "{}",

    // A generated dir ignored by .gitignore
    ".gitignore": gitignore,
    "generated/tmp.ts": "export const tmp = 1;\n",
  });
}

/** Gitignore content used by the default kitchen-sink case. */
export const DEFAULT_GITIGNORE = "generated/\n";
