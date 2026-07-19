/**
 * The fit solver — pure. Given a normalized bar, measured widths, and the
 * container budget, decide what every unit renders as: a variant, shed into
 * its group's disclosure, part of a collapsed group, or the overflow menu.
 *
 * Deterministic degradation policy, applied while over budget:
 *   1. among all available steps, take the one owned by the LOWEST-importance
 *      unit/group; ties prefer variant < shed < group-collapse < overflow;
 *      remaining ties degrade the RIGHTMOST first (end of bar yields first).
 *   2. a unit's variant steps run out before it may shed or overflow.
 *   3. a `shed` group moves children (at the CHILD's importance) into a
 *      group-local disclosure, but never below ONE visible child — the floor.
 *   4. a group with `collapse` collapses only after every child sits on its
 *      last variant AND shedding (if enabled) has hit its floor; once
 *      collapsed it degrades further as ONE unit (the whole group overflows
 *      together — a select can't half-overflow). A shed group WITHOUT
 *      `collapse` overflows whole at the floor instead.
 *   5. pinned (importance 5) units/groups may degrade variants but never
 *      shed, collapse away, or overflow. Everything else can ALWAYS reach the
 *      overflow menu, so any bar fits any width whose pinned floor fits.
 *
 * So the full group ladder mirrors the item ladder:
 *   items:  richest variant → … → smallest variant → (shed |) overflow
 *   groups: all children → shed to floor → collapsed control → overflow
 *
 * The overflow trigger occupies space only when something overflowed: solve
 * once without it; if anything overflowed, solve again with the trigger's
 * width reserved (a smaller budget can only overflow MORE, so two passes
 * reach the fixpoint). A group's disclosure trigger is budgeted the same way,
 * inside `measure`, whenever that group has shed children.
 *
 * Missing measurements count as width 0 and are reported via `complete:
 * false` — callers render the first frame from an incomplete solve and
 * re-solve when the ResizeObserver delivers real numbers.
 */
import type { NormalizedBar, NormalizedGroup, NormalizedUnit } from './schema';
import { PINNED } from './schema';

export interface FitMetrics {
  /** Width of unit `key` rendered at `variant`; undefined = not yet measured. */
  unit(key: string, variant: string): number | undefined;
  /** Width of group `id` rendered in its collapsed form ('menu' | 'select'). */
  groupCollapsed(groupId: string): number | undefined;
  /** Width of group `id`'s disclosure trigger (shed groups only). */
  groupTrigger(groupId: string): number | undefined;
  /** Width of the overflow trigger button. */
  readonly overflowTrigger: number;
  /** Gap between adjacent visible units. */
  readonly gap: number;
  /** Width of a derived separator between adjacent visible groups (with its gaps). */
  readonly separator: number;
}

export type UnitAssignment =
  | { readonly kind: 'variant'; readonly variant: string }
  | { readonly kind: 'shed' } // hidden behind its group's disclosure trigger
  | { readonly kind: 'collapsed' } // hidden behind its group's collapsed control
  | { readonly kind: 'overflow' };

export interface GroupAssignment {
  /** How many children sit behind the group's disclosure trigger. */
  readonly shedCount: number;
  /** The group renders as its single collapsed control. */
  readonly collapsed: boolean;
  /** No part of the group is visible in the bar. */
  readonly overflowed: boolean;
}

export interface FitResult {
  readonly units: ReadonlyMap<string, UnitAssignment>;
  readonly groups: ReadonlyMap<string, GroupAssignment>;
  readonly hasOverflow: boolean;
  /** Total visible width at this assignment (diagnostics + tests). */
  readonly width: number;
  /** False when any consulted measurement was missing (treated as 0). */
  readonly complete: boolean;
}

// ── internal mutable solve state ──────────────────────────────────────────────

interface UnitState {
  unit: NormalizedUnit;
  group: GroupState;
  /** Index into unit.variants (0 = richest). */
  variantIndex: number;
  shed: boolean;
  overflowed: boolean;
  /** Position in bar order — rightmost-first tie-breaking. */
  position: number;
}

interface GroupState {
  group: NormalizedGroup;
  section: 'start' | 'center' | 'end';
  collapsed: boolean;
  overflowed: boolean;
  units: UnitState[];
}

type Step =
  | { type: 'variant'; importance: number; position: number; unit: UnitState }
  | { type: 'shed'; importance: number; position: number; unit: UnitState }
  | { type: 'collapse'; importance: number; position: number; group: GroupState }
  | { type: 'overflow-unit'; importance: number; position: number; unit: UnitState }
  | { type: 'overflow-group'; importance: number; position: number; group: GroupState };

/** variant < shed < collapse < overflow when importance ties. */
const STEP_RANK: Record<Step['type'], number> = {
  variant: 0,
  shed: 1,
  collapse: 2,
  'overflow-unit': 3,
  'overflow-group': 3,
};

function buildState(bar: NormalizedBar): GroupState[] {
  const groups: GroupState[] = [];
  let position = 0;
  for (const section of bar.sections) {
    for (const g of section.groups) {
      const gs: GroupState = {
        group: g,
        section: section.name,
        collapsed: false,
        overflowed: false,
        units: [],
      };
      for (const u of g.units) {
        gs.units.push({
          unit: u,
          group: gs,
          variantIndex: 0,
          shed: false,
          overflowed: false,
          position,
        });
        position += 1;
      }
      groups.push(gs);
    }
  }
  return groups;
}

function nextStep(groups: GroupState[]): Step | null {
  let best: Step | null = null;
  const consider = (step: Step) => {
    if (
      !best ||
      step.importance < best.importance ||
      (step.importance === best.importance &&
        (STEP_RANK[step.type] < STEP_RANK[best.type] ||
          (STEP_RANK[step.type] === STEP_RANK[best.type] && step.position > best.position)))
    ) {
      best = step;
    }
  };

  for (const gs of groups) {
    if (gs.overflowed) continue;
    const groupPosition = gs.units.length ? gs.units[gs.units.length - 1].position : 0;

    if (gs.collapsed) {
      // A collapsed group degrades as one unit: overflow it whole.
      if (gs.group.importance < PINNED)
        consider({
          type: 'overflow-group',
          importance: gs.group.importance,
          position: groupPosition,
          group: gs,
        });
      continue;
    }

    let childrenExhausted = true;
    const visibleCount = gs.units.filter((u) => !u.overflowed && !u.shed).length;
    for (const us of gs.units) {
      if (us.overflowed || us.shed) continue;
      if (us.variantIndex < us.unit.variants.length - 1) {
        childrenExhausted = false;
        consider({
          type: 'variant',
          importance: us.unit.importance,
          position: us.position,
          unit: us,
        });
      } else if (us.unit.importance < PINNED) {
        if (gs.group.shed && visibleCount > 1) {
          // Stage 1: move the child behind the group's disclosure trigger —
          // never below one visible child (the floor).
          consider({
            type: 'shed',
            importance: us.unit.importance,
            position: us.position,
            unit: us,
          });
        } else if (!gs.group.shed && !gs.group.collapse) {
          // Plain group: children go to the GLOBAL overflow individually.
          consider({
            type: 'overflow-unit',
            importance: us.unit.importance,
            position: us.position,
            unit: us,
          });
        }
      }
    }

    // Stage 2 (terminal for the expanded form): available only once variants
    // are exhausted AND shedding — if enabled — sits at its floor.
    const shedExhausted = !gs.group.shed || visibleCount <= 1;
    if (childrenExhausted && shedExhausted && gs.group.importance < PINNED) {
      if (gs.group.collapse) {
        consider({
          type: 'collapse',
          importance: gs.group.importance,
          position: groupPosition,
          group: gs,
        });
      } else if (gs.group.shed) {
        // Shed group without a collapsed form: at the floor the WHOLE group
        // (visible + shed children) moves to the global overflow together.
        consider({
          type: 'overflow-group',
          importance: gs.group.importance,
          position: groupPosition,
          group: gs,
        });
      }
    }
  }
  return best;
}

function applyStep(step: Step): void {
  switch (step.type) {
    case 'variant':
      step.unit.variantIndex += 1;
      return;
    case 'shed':
      step.unit.shed = true;
      return;
    case 'collapse':
      step.group.collapsed = true;
      return;
    case 'overflow-unit': {
      step.unit.overflowed = true;
      if (step.unit.group.units.every((u) => u.overflowed)) step.unit.group.overflowed = true;
      return;
    }
    case 'overflow-group': {
      step.group.overflowed = true;
      for (const u of step.group.units) u.overflowed = true;
      return;
    }
  }
}

interface Measured {
  width: number;
  complete: boolean;
}

/**
 * Visible width of the current assignment: unit widths + gaps + derived
 * separators. Gaps are counted between ALL adjacent visible units, including
 * across section boundaries — deliberately conservative: the adapter's layout
 * spaces sections with collapsing auto margins, so the cross-section gap
 * allowance (≤ 2×gap) is slack those margins absorb, never an overlap risk.
 */
function measure(groups: GroupState[], metrics: FitMetrics, hasTrigger: boolean): Measured {
  let width = 0;
  let complete = true;
  let visibleUnits = 0;

  // Separators derive between adjacent visible groups within a section.
  const visibleBySection = new Map<string, number>();

  for (const gs of groups) {
    if (gs.overflowed) continue;
    if (gs.collapsed) {
      const w = metrics.groupCollapsed(gs.group.id);
      if (w === undefined) complete = false;
      width += w ?? 0;
      visibleUnits += 1;
      visibleBySection.set(gs.section, (visibleBySection.get(gs.section) ?? 0) + 1);
      continue;
    }
    let groupVisible = false;
    let shedCount = 0;
    for (const us of gs.units) {
      if (us.overflowed) continue;
      if (us.shed) {
        shedCount += 1;
        continue;
      }
      const w = metrics.unit(us.unit.key, us.unit.variants[us.variantIndex]);
      if (w === undefined) complete = false;
      width += w ?? 0;
      visibleUnits += 1;
      groupVisible = true;
    }
    if (shedCount > 0) {
      // The group's disclosure trigger takes real space, like any unit.
      const w = metrics.groupTrigger(gs.group.id);
      if (w === undefined) complete = false;
      width += w ?? 0;
      visibleUnits += 1;
      groupVisible = true;
    }
    if (groupVisible) visibleBySection.set(gs.section, (visibleBySection.get(gs.section) ?? 0) + 1);
  }

  if (hasTrigger) {
    width += metrics.overflowTrigger;
    visibleUnits += 1;
  }
  if (visibleUnits > 1) width += metrics.gap * (visibleUnits - 1);
  for (const count of visibleBySection.values())
    if (count > 1) width += metrics.separator * (count - 1);

  return { width, complete };
}

function anyOverflow(groups: GroupState[]): boolean {
  return groups.some((gs) => gs.units.some((u) => u.overflowed));
}

function solvePass(
  bar: NormalizedBar,
  metrics: FitMetrics,
  budget: number,
  hasTrigger: boolean,
): { groups: GroupState[]; measured: Measured } {
  const groups = buildState(bar);
  let measured = measure(groups, metrics, hasTrigger);
  while (measured.width > budget) {
    const step = nextStep(groups);
    if (!step) break; // pinned floor — nothing left to shed
    applyStep(step);
    measured = measure(groups, metrics, hasTrigger);
  }
  return { groups, measured };
}

export function solve(bar: NormalizedBar, metrics: FitMetrics, containerWidth: number): FitResult {
  // Pass 1: assume no trigger. If nothing overflows, done.
  let pass = solvePass(bar, metrics, containerWidth, false);
  if (anyOverflow(pass.groups)) {
    // Pass 2: same budget, trigger now takes real space in `measure`. The step
    // sequence is budget-independent, so pass 2 degrades strictly further than
    // pass 1 — overflow can't disappear, and the trigger stays justified.
    pass = solvePass(bar, metrics, containerWidth, true);
  }

  const units = new Map<string, UnitAssignment>();
  const groupAssignments = new Map<string, GroupAssignment>();
  for (const gs of pass.groups) {
    // Overflow ≻ collapsed ≻ shed: a group that shed a few children and THEN
    // collapsed (or overflowed) subsumes them into the later, stronger state.
    const shedCount = gs.units.filter((u) => u.shed && !u.overflowed && !gs.collapsed).length;
    groupAssignments.set(gs.group.id, {
      shedCount,
      collapsed: gs.collapsed,
      overflowed: gs.overflowed,
    });
    for (const us of gs.units) {
      units.set(
        us.unit.key,
        us.overflowed
          ? { kind: 'overflow' }
          : gs.collapsed
            ? { kind: 'collapsed' }
            : us.shed
              ? { kind: 'shed' }
              : { kind: 'variant', variant: us.unit.variants[us.variantIndex] },
      );
    }
  }
  return {
    units,
    groups: groupAssignments,
    hasOverflow: anyOverflow(pass.groups),
    width: pass.measured.width,
    complete: pass.measured.complete,
  };
}
