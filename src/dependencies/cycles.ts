import type { DependencyCycle } from "../types/dependency.js";

/**
 * Deterministic dependency cycle detection.
 *
 * Approach: Tarjan's strongly-connected-components decomposition finds every
 * non-trivial SCC (a group of modules that can reach each other). Inside each
 * SCC we enumerate the elementary cycles with an iterative DFS from the SCC's
 * canonically-lowest node, so each logical cycle is reported exactly once
 * regardless of traversal start. A module with a self-edge is a trivial SCC
 * reported as a self-cycle.
 *
 * Recursion depth is bounded by the number of internal nodes, so it is safe
 * for real repositories (the scanner itself already bounds traversal this way).
 *
 * Cycle order is deterministic: members follow source→target order starting at
 * the SCC minimum; the cycle list is sorted by the joined member sequence.
 */

function minOf(nodes: readonly string[]): string {
  let m = nodes[0]!;
  for (const n of nodes) {
    if (n < m) m = n;
  }
  return m;
}

/** Enumerate elementary cycles inside one SCC from its canonical minimum. */
function cyclesFrom(start: string, adj: ReadonlyMap<string, readonly string[]>): string[][] {
  const result: string[][] = [];
  const visited = new Set<string>([start]);
  const path: string[] = [start];
  const stack: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];

  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const neighbors = adj.get(top.node) ?? [];
    if (top.next < neighbors.length) {
      const n = neighbors[top.next]!;
      top.next += 1;
      if (n === start) {
        result.push([...path]);
      } else if (!visited.has(n) && n > start) {
        visited.add(n);
        path.push(n);
        stack.push({ node: n, next: 0 });
      }
    } else {
      stack.pop();
      const done = path.pop()!;
      visited.delete(done);
    }
  }
  return result;
}

/** Build adjacency (deterministic neighbor order). */
function buildAdjacency(
  nodes: ReadonlySet<string>,
  edges: readonly { source: string; target: string }[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    adj.set(node, []);
  }
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const list = adj.get(edge.source);
    if (list === undefined || !nodes.has(edge.target)) continue;
    list.push(edge.target);
  }
  for (const list of adj.values()) {
    list.sort();
  }
  return adj;
}

/** Tarjan's strongly-connected-components (recursive; depth ≤ node count). */
function stronglyConnectedComponents(
  nodes: ReadonlySet<string>,
  adj: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  const strongconnect = (v: string): void => {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v)! === index.get(v)!) {
      const scc: string[] = [];
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      sccs.push(scc);
    }
  };

  const ordered = [...nodes].sort();
  for (const v of ordered) {
    if (!index.has(v)) {
      strongconnect(v);
    }
  }
  return sccs;
}

/** Detect all dependency cycles in the graph. */
export function detectCycles(
  nodes: ReadonlySet<string>,
  edges: readonly { source: string; target: string }[],
): DependencyCycle[] {
  const adj = buildAdjacency(nodes, edges);

  // Self-loops are reported independently: a module that imports itself is a
  // 1-cycle, even when the module also participates in a larger SCC.
  const selfNodes = new Set<string>();
  for (const edge of edges) {
    if (edge.source === edge.target && nodes.has(edge.source)) {
      selfNodes.add(edge.source);
    }
  }

  const sccs = stronglyConnectedComponents(nodes, adj);
  const cycles: DependencyCycle[] = [...selfNodes].map((n) => ({ members: [n] }));

  for (const scc of sccs) {
    if (scc.length === 1) {
      // A trivial SCC that did not self-loop is not a cycle.
      continue;
    }
    const start = minOf(scc);
    for (const memberPath of cyclesFrom(start, adj)) {
      cycles.push({ members: memberPath });
    }
  }

  cycles.sort((a, b) => {
    const ka = a.members.join("\u0000");
    const kb = b.members.join("\u0000");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return cycles;
}
