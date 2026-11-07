import type { ObjectReferrer } from './types';

/**
 * Limits on edge resolution. Exceeding any of them makes the object's usage
 * `incomplete`, which the evaluator turns into an indeterminate step: an
 * adversary can make evidence expensive, never make it disappear.
 */
export interface EdgeResolverBudget {
  /**
   * Longest chain of unchanged objects an edge may be resolved through. A
   * loop counts the member the edge enters it at, and the member it leaves
   * from when that is another one.
   */
  maxDepth: number;
  /** Most anchored edges one object may end up with. */
  maxEdgesPerObject: number;
  /** Most referrer reads per resolver: each object is read once. */
  maxReads: number;
}

export const DEFAULT_EDGE_RESOLVER_BUDGET: EdgeResolverBudget = {
  maxDepth: 16,
  maxEdgesPerObject: 256,
  maxReads: 20_000,
};

export const USAGE_INCOMPLETE = 'incomplete';
export type ResolvedUsage = ObjectReferrer[] | typeof USAGE_INCOMPLETE;

/**
 * The label segment that stands for a route between two members of a loop.
 * Fork labels are ASCII (keys are `#`-escaped), so it is never a key.
 */
const LOOP_ROUTE = '…';

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
 * A graph traversal, not a path enumeration. The unchanged objects above
 * an object are read once each and split into strongly connected
 * components (loops: a structure tree, whose elements point at their
 * parent with `/P` and at their children with `/K`; an outline, whose
 * items point at their neighbours; an annotation and its popup), resolved
 * ancestors first and memoised per object, so a lattice of shared objects
 * costs its size, not the number of paths through it.
 *
 * Every member of a loop reaches every other one, so an edge into a loop
 * reaches all its members: as it is at the member it enters, and as
 * `<label>/…` at every other one, the route between them collapsed. The
 * route consists of unchanged objects, the same in both revisions, so it
 * carries no evidence; the anchor, the way in and the way out (the labels
 * either side of `…`) do, and they are kept. Edges whose label collapses
 * a route are told apart by anchor and label alone.
 */
export class EdgeResolver {
  /** Raw inbound edges, per object read. */
  private readonly referrers = new Map<number, ObjectReferrer[]>();
  /** Anchored edges per resolved object; null when they exceeded the budget. */
  private readonly resolved = new Map<number, ObjectReferrer[] | null>();
  private reads = 0;
  private exhausted = false;

  constructor(
    private readonly read: (objectNumber: number) => ObjectReferrer[],
    private readonly anchors: ReadonlySet<number>,
    private readonly budget: EdgeResolverBudget = DEFAULT_EDGE_RESOLVER_BUDGET,
  ) {}

  /** Anchored edges of `objectNumber`, or `incomplete` when a budget was exceeded. */
  resolve(objectNumber: number): ResolvedUsage {
    if (!this.resolved.has(objectNumber)) {
      const components = this.componentsAbove(objectNumber);
      for (const component of components ?? []) {
        if (!this.resolveComponent(component)) break;
      }
    }
    return this.resolved.get(objectNumber) ?? USAGE_INCOMPLETE;
  }

  private readReferrers(n: number): ObjectReferrer[] | null {
    const known = this.referrers.get(n);
    if (known) return known;
    if (this.exhausted || this.reads >= this.budget.maxReads) {
      this.exhausted = true;
      return null;
    }
    this.reads += 1;
    const raw = this.read(n);
    this.referrers.set(n, raw);
    return raw;
  }

  /** The parents of an object still to be resolved: unchanged, non-structural, not resolved yet. */
  private pendingParents(raw: ObjectReferrer[]): number[] {
    const out = new Set<number>();
    for (const e of raw) {
      if (!this.anchors.has(e.parent) && !this.resolved.has(e.parent)) out.add(e.parent);
    }
    return [...out];
  }

  /**
   * The strongly connected components of the unresolved objects above
   * `start` (Tarjan's algorithm, iterative), ancestors first; null when the
   * read budget ran out.
   */
  private componentsAbove(start: number): number[][] | null {
    const index = new Map<number, number>();
    const low = new Map<number, number>();
    const stack: number[] = [];
    const onStack = new Set<number>();
    const frames: Array<{ node: number; parents: number[]; next: number }> = [];
    const components: number[][] = [];

    const enter = (n: number): boolean => {
      const raw = this.readReferrers(n);
      if (!raw) return false;
      index.set(n, index.size);
      low.set(n, index.get(n)!);
      stack.push(n);
      onStack.add(n);
      frames.push({ node: n, parents: this.pendingParents(raw), next: 0 });
      return true;
    };

    if (!enter(start)) return null;
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.next < frame.parents.length) {
        const p = frame.parents[frame.next++];
        if (!index.has(p)) {
          if (!enter(p)) return null;
        } else if (onStack.has(p)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(p)!));
        }
        continue;
      }
      frames.pop();
      const n = frame.node;
      if (frames.length > 0) {
        const below = frames[frames.length - 1].node;
        low.set(below, Math.min(low.get(below)!, low.get(n)!));
      }
      if (low.get(n) === index.get(n)) {
        const component: number[] = [];
        let m: number;
        do {
          m = stack.pop()!;
          onStack.delete(m);
          component.push(m);
        } while (m !== n);
        components.push(component);
      }
    }
    return components;
  }

  /** Resolve one component whose ancestors are all resolved; false when it exceeded the budget. */
  private resolveComponent(component: number[]): boolean {
    const members = new Set(component);
    const result =
      component.length === 1
        ? this.edgesOfSingle(component[0])
        : this.edgesOfLoop(component, members);
    if (!result) {
      for (const n of component) this.resolved.set(n, null);
      return false;
    }
    for (const n of component) this.resolved.set(n, result.get(n)!);
    return true;
  }

  /** An object outside any loop: its raw edges, each resolved through its parent. */
  private edgesOfSingle(n: number): Map<number, ObjectReferrer[]> | null {
    const edges: ObjectReferrer[] = [];
    for (const e of this.referrers.get(n)!) {
      if (e.parent === n) continue; // a reference to itself leads to no anchor
      const through = this.through(e);
      if (!through) return null;
      edges.push(...through);
    }
    const unique = withoutCollapsedDuplicates(edges);
    return unique.length > this.budget.maxEdgesPerObject ? null : new Map([[n, unique]]);
  }

  /**
   * A loop: every anchored edge into it, as it is at the member it enters
   * and with the route collapsed at every other member.
   */
  private edgesOfLoop(
    component: number[],
    members: Set<number>,
  ): Map<number, ObjectReferrer[]> | null {
    const entering = new Map<number, ObjectReferrer[]>();
    // Each collapsed route, entering at up to two members: one that enters
    // at a single member leads to every member but that one.
    const routes = new Map<string, ObjectReferrer[]>();
    for (const s of component) {
      const own: ObjectReferrer[] = [];
      for (const e of this.referrers.get(s)!) {
        if (members.has(e.parent)) continue;
        const through = this.through(e);
        if (!through) return null;
        for (const u of through) {
          own.push(u);
          const via = [...(u.via ?? []), s];
          if (via.length >= this.budget.maxDepth) return null;
          const route = { parent: u.parent, label: `${u.label}/${LOOP_ROUTE}`, via };
          const known = routes.get(edgeKey(route));
          if (!known) routes.set(edgeKey(route), [route]);
          else if (known.length === 1 && entryOf(known[0]) !== s) known.push(route);
        }
        if (own.length > this.budget.maxEdgesPerObject) return null;
      }
      if (own.length > 0) entering.set(s, withoutCollapsedDuplicates(own));
    }
    if (routes.size > this.budget.maxEdgesPerObject) return null;

    const out = new Map<number, ObjectReferrer[]>();
    const toAny = [...routes.values()].map((entries) => entries[0]);
    for (const n of component) {
      const own = entering.get(n);
      if (!own) {
        out.set(n, toAny);
        continue;
      }
      const toThis: ObjectReferrer[] = [];
      for (const entries of routes.values()) {
        const route = entries.find((r) => entryOf(r) !== n);
        if (route) toThis.push(route);
      }
      const edges = [...own, ...toThis];
      if (edges.length > this.budget.maxEdgesPerObject) return null;
      out.set(n, edges);
    }
    return out;
  }

  /** The anchored edges one raw edge stands for; null when its parent exceeded the budget. */
  private through(e: ObjectReferrer): ObjectReferrer[] | null {
    if (this.anchors.has(e.parent)) return [e];
    const above = this.resolved.get(e.parent);
    if (!above) return null;
    const out: ObjectReferrer[] = [];
    for (const u of above) {
      const via = [...(u.via ?? []), e.parent];
      if (via.length >= this.budget.maxDepth) return null;
      out.push({ parent: u.parent, label: `${u.label}/${e.label}`, via });
    }
    return out;
  }
}

function edgeKey(e: ObjectReferrer): string {
  return `${e.parent}:${e.label}`;
}

/** The member a collapsed route enters its loop at: the last object it was resolved through. */
function entryOf(route: ObjectReferrer): number {
  return route.via![route.via!.length - 1];
}

/** Edges whose label collapses a route are told apart by anchor and label alone. */
function withoutCollapsedDuplicates(edges: ObjectReferrer[]): ObjectReferrer[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    if (!e.label.includes(LOOP_ROUTE)) return true;
    const key = edgeKey(e);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
