import type { ObjectReferrer } from './types';

/**
 * Limits on edge resolution. Exceeding any of them makes the object's usage
 * `incomplete`, which the evaluator turns into an indeterminate step: an
 * adversary can make evidence expensive, never make it disappear.
 */
export interface EdgeResolverBudget {
  /** Longest chain of unchanged objects an edge may be resolved through. */
  maxDepth: number;
  /** Most anchored edges one object may end up with. */
  maxEdgesPerObject: number;
  /** Most referrer reads per resolver (one per side per step). */
  maxReads: number;
}

export const DEFAULT_EDGE_RESOLVER_BUDGET: EdgeResolverBudget = {
  maxDepth: 16,
  maxEdgesPerObject: 256,
  maxReads: 20_000,
};

export const USAGE_INCOMPLETE = 'incomplete';
export type ResolvedUsage = ObjectReferrer[] | typeof USAGE_INCOMPLETE;

interface Resolution {
  edges: ObjectReferrer[];
  /** A cycle was skipped while computing this: do not memoise. */
  cyclic: boolean;
}

/**
 * Resolves the raw inbound edges of an object (from the fork's referrer
 * index, which covers every reachable object of a revision) into edges
 * from *anchors*: the changed objects and the structural objects of the
 * revision (trailer, catalog, AcroForm, page tree root, pages, fields,
 * widgets). An edge from an unchanged, non-structural parent is replaced by
 * that parent's own anchored edges with the labels joined, so an
 * appearance stream under an unchanged indirect `/AP` dictionary reads
 * `widget:AP/N` rather than `apDict:N`.
 *
 * A graph traversal, not a path enumeration: results are memoised per
 * object, so a lattice of shared unchanged objects costs its size, not the
 * number of paths through it. Cycle edges contribute no anchors and are
 * skipped; a result computed while skipping one is not memoised.
 */
export class EdgeResolver {
  private readonly memo = new Map<number, Resolution>();
  private reads = 0;
  private exhausted = false;

  constructor(
    private readonly read: (objectNumber: number) => ObjectReferrer[],
    private readonly anchors: ReadonlySet<number>,
    private readonly budget: EdgeResolverBudget = DEFAULT_EDGE_RESOLVER_BUDGET,
  ) {}

  /** Anchored edges of `objectNumber`, or `incomplete` when a budget was exceeded. */
  resolve(objectNumber: number): ResolvedUsage {
    if (this.exhausted) return USAGE_INCOMPLETE;
    const result = this.resolveInner(objectNumber, new Set());
    return result === null ? USAGE_INCOMPLETE : result.edges;
  }

  private resolveInner(n: number, active: Set<number>): Resolution | null {
    const hit = this.memo.get(n);
    if (hit) return hit;
    if (active.size >= this.budget.maxDepth) return null;
    if (this.reads >= this.budget.maxReads) {
      this.exhausted = true;
      return null;
    }
    this.reads += 1;
    const raw = this.read(n);

    active.add(n);
    const edges: ObjectReferrer[] = [];
    let cyclic = false;
    try {
      for (const e of raw) {
        if (this.anchors.has(e.parent)) {
          edges.push(e);
        } else if (active.has(e.parent)) {
          cyclic = true; // a loop back into the chain: no new anchor lies that way
          continue;
        } else {
          const up = this.resolveInner(e.parent, active);
          if (up === null) return null;
          cyclic ||= up.cyclic;
          for (const u of up.edges) {
            edges.push({
              parent: u.parent,
              label: `${u.label}/${e.label}`,
              via: [...(u.via ?? []), e.parent],
            });
          }
        }
        if (edges.length > this.budget.maxEdgesPerObject) return null;
      }
    } finally {
      active.delete(n);
    }
    const resolution = { edges, cyclic };
    if (!cyclic) this.memo.set(n, resolution);
    return resolution;
  }
}
