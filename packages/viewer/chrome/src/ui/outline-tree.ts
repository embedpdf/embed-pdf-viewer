/**
 * The outline panel's rules, as plain functions: which rows a filter shows,
 * whether an item's own colour reads on the panel, and where a dragged row
 * lands. The panel (outline-panel.tsx) draws what these say.
 */
import type {
  OutlineItem,
  OutlineItemRef,
  OutlinePosition,
  OutlineRow,
} from '@embedpdf/react/outline';

/** A row's height, in px: every row has the same, so the list draws only the rows in view. */
export const OUTLINE_ROW_HEIGHT = 30;
/** How far each level is indented, in px. */
export const OUTLINE_INDENT = 16;

export const outlineKeyOf = (ref: OutlineItemRef | null): string =>
  ref ? String(ref.objectNumber) : 'top';

/**
 * The rows a filter shows: every item whose title holds the text, whatever its case, with the
 * items it sits under so it is found in its place. Every shown parent shows its children.
 */
export function filteredRows(items: readonly OutlineItem[], query: string): OutlineRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const byKey = new Map(items.map((item) => [outlineKeyOf(item.ref), item]));
  const shown = new Set<string>();
  for (const item of items) {
    if (!item.title.toLocaleLowerCase().includes(needle)) continue;
    for (let at: OutlineItem | undefined = item; at; ) {
      const key = outlineKeyOf(at.ref);
      if (shown.has(key)) break;
      shown.add(key);
      at = at.parent ? byKey.get(outlineKeyOf(at.parent)) : undefined;
    }
  }
  const depthOf = new Map<string, number>();
  const parents = new Set(
    items.flatMap((item) => (item.parent ? [outlineKeyOf(item.parent)] : [])),
  );
  const rows: OutlineRow[] = [];
  for (const item of items) {
    const key = outlineKeyOf(item.ref);
    const depth = item.parent ? (depthOf.get(outlineKeyOf(item.parent)) ?? -1) + 1 : 0;
    depthOf.set(key, depth);
    if (!shown.has(key)) continue;
    const hasChildren = parents.has(key);
    rows.push({ item, depth, hasChildren, expanded: hasChildren });
  }
  return rows;
}

/** The panel's background in each mode, as the viewer's theme draws it. */
const SURFACE = { light: '#ffffff', dark: '#1f2937' } as const;

/** WCAG's least contrast for large or bold text, and for parts of a picture. */
const LEAST_CONTRAST = 3;

/** A `#rrggbb` colour's relative luminance (WCAG 2.2, "relative luminance"). */
function luminanceOf(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  const channel = (shift: number) => {
    const level = ((value >> shift) & 0xff) / 255;
    return level <= 0.04045 ? level / 12.92 : ((level + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * The colour to draw an item's title in: its own (`/C`), unless it would read badly on the
 * panel (a dark red in the dark theme, yellow in the light one); then the panel's own text
 * colour, as for an item without one.
 */
export function readableColor(color: string | null, mode: 'light' | 'dark'): string | null {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  const [lighter, darker] = [luminanceOf(color), luminanceOf(SURFACE[mode])].sort(
    (left, right) => right - left,
  );
  return (lighter! + 0.05) / (darker! + 0.05) >= LEAST_CONTRAST ? color : null;
}

/** Where a dragged row lands: its new parent and place, and the level the line is drawn at. */
export interface OutlineDrop {
  readonly parent: OutlineItemRef | null;
  readonly position: OutlinePosition;
  readonly depth: number;
}

/**
 * The keys of the rows that move with `dragged`: each dragged row and the rows under it that
 * show. A drop among them would put an item under itself.
 */
export function movingKeysOf(
  rows: readonly OutlineRow[],
  dragged: ReadonlySet<string>,
): Set<string> {
  const moving = new Set<string>();
  let under = -1;
  for (const row of rows) {
    const key = outlineKeyOf(row.item.ref);
    if (under >= 0 && row.depth > under) {
      moving.add(key);
      continue;
    }
    under = -1;
    if (dragged.has(key)) {
      moving.add(key);
      under = row.depth;
    }
  }
  return moving;
}

/**
 * Where rows dropped in the gap before `rows[gap]` land, at the level the pointer asks for
 * (`depth`), as a tree view lets them: no deeper than one level under the row above, and no
 * shallower than the row below, so the tree stays a tree. `moving` are the rows that move: the
 * gaps among them are left out. `null` when no row stays to place them by.
 */
export function dropOf(
  rows: readonly OutlineRow[],
  moving: ReadonlySet<string>,
  gap: number,
  depth: number,
): OutlineDrop | null {
  const kept = rows.filter((row) => !moving.has(outlineKeyOf(row.item.ref)));
  if (kept.length === 0) return null;
  const at = rows.slice(0, gap).filter((row) => !moving.has(outlineKeyOf(row.item.ref))).length;
  const above = kept[at - 1];
  const below = kept[at];
  const deepest = above ? above.depth + 1 : 0;
  const shallowest = below ? Math.min(below.depth, deepest) : 0;
  const level = Math.max(shallowest, Math.min(deepest, Math.round(depth)));
  let parent: OutlineItemRef | null = null;
  let previous: OutlineItemRef | null = null;
  for (let i = at - 1; i >= 0; i -= 1) {
    const row = kept[i]!;
    if (row.depth < level) {
      parent = row.item.ref;
      break;
    }
    if (row.depth === level && previous === null) previous = row.item.ref;
  }
  return { parent, position: previous ? { after: previous } : 'start', depth: level };
}
