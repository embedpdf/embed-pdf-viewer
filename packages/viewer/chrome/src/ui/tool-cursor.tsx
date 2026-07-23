/**
 * THIS viewer's armed-tool cursor: the toolbar's own icon riding the pointer
 * as a real CSS cursor (OS-composited — zero lag, unlike any DOM follower).
 * The library owns arbitration (unmapped hover claims win, page gaps fall
 * back to the arrow — see `useToolCursor`); this module only decides what the
 * cursor LOOKS like. It reuses the SAME icon set and the SAME accent
 * derivation as the toolbar buttons (TOOL_ICONS is recorded by the command
 * definitions), so the cursor is pixel-identical to the button the user just
 * pressed — recolor the tool and both follow. A tool without a command icon
 * keeps its declared keyword cursor.
 *
 * ONE table decides the shape ({@link GLYPHS}): cursor KEYWORDS are the
 * affordances — a tool declares its base ('crosshair' to draw, 'copy' to
 * place), the selection handler claims 'text' over text — and each mapped
 * keyword is redrawn as its glyph + the tool's icon. Keywords the table omits
 * stay native: a markup tool's 'default' base is the bare arrow (identity
 * appears exactly where the action is possible — over text), a foreign 'move'
 * over an annotation drops the icon. A new tool gets the right cursor from
 * what it declares; nothing tool-specific lives here.
 *
 * The image: a white-haloed glyph at the hotspot (readable on any page color)
 * with the icon at its top right — 40px, under the 128px cursor ceiling;
 * Chromium may briefly show the default arrow when a >32px cursor would
 * overlap browser UI (anti-spoofing), which is fine mid-viewport.
 */
import { useToolCursor, useTool } from '@embedpdf/react/interaction';
import { useAnnotationDefaults } from '@embedpdf/react/annotation';
import { TOOL_ICONS } from '../config/commands';
import { ICON_PATHS } from './icons';
import type { IconAccent } from './icons';

const SIZE = 40;
const HOTSPOT = { x: 8, y: 28 };
const INK = '#1a1a1a';
const HALO = '#ffffff';
/** The drag-and-drop "will place a copy" green (Chrome's DnD badge). */
const PLACE_GREEN = '#34a853';

/** The icon's paths as SVG markup — the string twin of `<Icon>`'s render loop
 *  (same fill/stroke slot rules), with a white halo pass underneath so the
 *  glyph stays readable over page content. */
function iconGlyph(name: string, accent?: IconAccent): string | null {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  const halo: string[] = [];
  const draw: string[] = [];
  for (const p of paths) {
    const spec = typeof p === 'string' ? { d: p, fill: undefined, stroke: undefined } : p;
    // Slot rules, mirrored from <Icon>: a fill slot paints from the accent
    // (nothing without one), a stroke slot falls back to the ink, and a
    // fill-only path never gets an outline.
    const fill = spec.fill === true ? INK : spec.fill ? accent?.[spec.fill] : undefined;
    const stroke = spec.stroke ? (accent?.[spec.stroke] ?? INK) : spec.fill ? 'none' : INK;
    halo.push(`<path d="${spec.d}" fill="none" stroke="${HALO}" stroke-width="3.5"/>`);
    draw.push(`<path d="${spec.d}" fill="${fill ?? 'none'}" stroke="${stroke}"/>`);
  }
  return halo.join('') + draw.join('');
}

/** The action glyph drawn at the hotspot: what a click DOES here. */
type Glyph = 'crosshair' | 'ibeam' | 'plus';

const haloed = (x1: number, y1: number, x2: number, y2: number): string =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${HALO}" stroke-width="3"/>` +
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="1.25"/>`;

function actionGlyph(glyph: Glyph): string {
  const { x, y } = HOTSPOT;
  if (glyph === 'crosshair') {
    return haloed(x, y - 6, x, y + 6) + haloed(x - 6, y, x + 6, y);
  }
  if (glyph === 'ibeam') {
    return (
      haloed(x, y - 6.5, x, y + 6.5) +
      haloed(x - 2.5, y - 6.5, x + 2.5, y - 6.5) +
      haloed(x - 2.5, y + 6.5, x + 2.5, y + 6.5)
    );
  }
  // plus: the DnD copy affordance — green disc, white plus.
  return (
    `<circle cx="${x}" cy="${y}" r="7.5" fill="${PLACE_GREEN}" stroke="${HALO}" stroke-width="1.5"/>` +
    `<line x1="${x}" y1="${y - 3.5}" x2="${x}" y2="${y + 3.5}" stroke="${HALO}" stroke-width="2"/>` +
    `<line x1="${x - 3.5}" y1="${y}" x2="${x + 3.5}" y2="${y}" stroke="${HALO}" stroke-width="2"/>`
  );
}

function cursorSvg(glyph: Glyph, icon: string, accent?: IconAccent): string {
  const g = iconGlyph(icon, accent);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" ` +
    `viewBox="0 0 ${SIZE} ${SIZE}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    actionGlyph(glyph) +
    (g
      ? `<g transform="translate(17 3) scale(${(20 / 24).toFixed(4)})" stroke-width="2">${g}</g>`
      : '') +
    `</svg>`
  );
}

/** keyword → glyph: how each affordance is drawn when a tool icon rides
 *  along. Draw tools declare 'crosshair', place tools (stamp/signature/image)
 *  declare 'copy', and the selection handler claims 'text' over text — which
 *  keywords ever SHOW is decided by those declarations and claims, never
 *  here. 'default' is deliberately absent: the bare arrow means "no action
 *  here", so it never carries an icon. */
const GLYPHS: Record<string, Glyph> = {
  crosshair: 'crosshair',
  text: 'ibeam',
  copy: 'plus',
};

/** Mount once (renders nothing): keeps the armed tool's cursor skin in sync
 *  with its toolbar icon + live defaults. */
export function ArmedToolCursor() {
  const { activeToolId } = useTool();
  // Live accent: a `setDefaults` recolor re-renders us and rebuilds the cursor.
  const d = useAnnotationDefaults(activeToolId);
  const entry = TOOL_ICONS[activeToolId];
  const accent = entry?.accent
    ? {
        primary: d[entry.accent.primary] ?? undefined,
        secondary: entry.accent.secondary ? (d[entry.accent.secondary] ?? undefined) : undefined,
      }
    : undefined;
  useToolCursor(
    entry
      ? {
          toolId: activeToolId,
          cursors: Object.fromEntries(
            Object.entries(GLYPHS).map(([keyword, glyph]) => [
              keyword,
              { svg: cursorSvg(glyph, entry.icon, accent), hotspot: HOTSPOT },
            ]),
          ),
        }
      : null,
  );
  return null;
}
