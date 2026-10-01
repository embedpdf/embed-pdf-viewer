/**
 * The chrome — structure only. No breakpoints, no show/hide lists, no locale
 * overrides, no dividers/spacers, no hand-written overflow menus. What fits is
 * measured and solved at runtime (@embedpdf/core-ui); the overflow menu is
 * derived.
 *
 * `importance` (1 sheds first … 5 pinned) is the only responsive knob.
 */
import {
  defineChrome,
  group,
  item,
  custom,
  type BarSchema,
  type ChromeSchema,
  type MenuSchema,
} from '@embedpdf/react/toolbar';

// Reused across every mode band — plain values, so composition is just a const.
const style = group('style', [item('panel:annotation-style')], { importance: 4 });
const history = group('history', ['history:undo', 'history:redo'], { importance: 3 });

// ── main toolbar ─────────────────────────────────────────────────────────────
const mainBar: BarSchema = {
  id: 'main',
  sections: {
    // The start section sits left-aligned — document menu, workspace, zoom
    // strip, pan/pointer. Only the mode tabs are truly centered.
    start: [
      group('document', [item('document:menu')], { importance: 5 }),
      group('workspace', [item('panel:sidebar', { importance: 5 }), item('page:settings')], {
        importance: 4,
      }),
      // The inline zoom strip; when it can't fit it renders its 'button'
      // variant, and in the overflow menu it projects through zoom:menu.
      group('zoom', [custom('zoom-controls', 'zoom:menu', { variants: ['inline', 'button'] })], {
        importance: 4,
      }),
      group('tools', ['pan:toggle', 'pointer:toggle'], { importance: 2 }),
    ],
    center: [
      group(
        'modes',
        [
          item('mode:view', { variants: ['label'], importance: 1 }),
          item('mode:annotate', { variants: ['label'], importance: 1 }),
          item('mode:shapes', { variants: ['label'], importance: 1 }),
          item('mode:insert', { variants: ['label'], importance: 1 }),
          item('mode:form', { variants: ['label'], importance: 1 }),
          item('mode:redact', { variants: ['label'], importance: 1 }),
          item('mode:measure', { variants: ['label'], importance: 1 }),
        ],
        {
          role: 'tabs',
          // The group ladder: full strip → trailing tabs shed behind a derived
          // in-strip chevron → select → global overflow. Tab items at importance 1
          // so the strip is the first thing to compact; the group at 4 so its
          // compact forms survive long.
          shed: true,
          collapse: 'select',
          importance: 4,
          labelKey: 'commands.mode.group',
        },
      ),
    ],
    end: [group('panels', ['panel:search', 'panel:comment'], { importance: 5 })],
  },
};

// ── secondary bands (one per mode; which shows is derived from shell) ────────
const annotateBar: BarSchema = {
  id: 'annotate',
  sections: {
    center: [
      group('comment', ['annotation:add-note', 'annotation:add-link'], { importance: 4 }),
      group(
        'markup',
        [
          'annotation:add-highlight',
          'annotation:add-strikeout',
          'annotation:add-underline',
          'annotation:add-squiggly',
        ],
        { importance: 4 },
      ),
      group('draw', ['annotation:add-ink', 'annotation:add-ink-highlight'], { importance: 3 }),
      group(
        'text',
        [
          'annotation:add-text',
          'annotation:add-insert-text',
          'annotation:add-replace-text',
          'annotation:add-callout',
        ],
        { importance: 2 },
      ),
      style,
      history,
    ],
  },
};

const shapesBar: BarSchema = {
  id: 'shapes',
  sections: {
    center: [
      group(
        'shapes',
        [
          'annotation:add-rectangle',
          'annotation:add-circle',
          'annotation:add-line',
          'annotation:add-arrow',
        ],
        { importance: 4 },
      ),
      group('polygons', ['annotation:add-polygon', 'annotation:add-polyline'], { importance: 2 }),
      style,
      history,
    ],
  },
};

const insertBar: BarSchema = {
  id: 'insert',
  sections: {
    center: [
      group(
        'stamps',
        [
          'insert:add-stamp',
          // Quick marks (`stamps.toolbar`): thumbnails that arm on click; in a
          // menu the stamps panel stands in for them.
          custom('quick-stamps', 'insert:add-stamp', { importance: 3 }),
          'insert:add-attachment',
          'insert:add-signature',
          'insert:add-image',
        ],
        { importance: 4 },
      ),
      style,
      history,
    ],
  },
};

const formBar: BarSchema = {
  id: 'form',
  sections: {
    center: [
      group('fields', ['form:add-textfield', 'form:add-checkbox', 'form:add-radio'], {
        importance: 4,
      }),
      group('choice-fields', ['form:add-select', 'form:add-listbox'], { importance: 2 }),
      group('signature-fields', ['form:add-signature'], { importance: 2 }),
      history,
    ],
  },
};

const measureBar: BarSchema = {
  id: 'measure',
  sections: {
    center: [
      group(
        'measure',
        [
          'measurement:distance',
          'measurement:perimeter',
          'measurement:area',
          'measurement:calibrate',
        ],
        { importance: 5 },
      ),
      group('scale', [custom('measurement-scale', 'panel:measurement', { variants: ['inline'] })], {
        importance: 4,
      }),
      style,
    ],
  },
};

const redactBar: BarSchema = {
  id: 'redact',
  sections: {
    center: [
      group('redact', ['redaction:redact', 'panel:redaction'], { importance: 4 }),
      style,
      history,
    ],
  },
};

// ── menus (command trees; separators derive between sections) ────────────────
const documentMenu: MenuSchema = {
  id: 'document',
  sections: [
    { items: ['document:download', 'document:print'] },
    { items: ['document:fullscreen'] },
  ],
};

const zoomMenu: MenuSchema = {
  id: 'zoom',
  sections: [
    {
      labelKey: 'commands.zoom.level',
      items: ['zoom:50', 'zoom:100', 'zoom:150', 'zoom:200', 'zoom:400'],
    },
    { items: ['zoom:in', 'zoom:out'] },
    { items: ['zoom:fit-page', 'zoom:fit-width', 'zoom:automatic'] },
  ],
};

const pageSettingsMenu: MenuSchema = {
  id: 'page-settings',
  sections: [
    { labelKey: 'commands.spread.group', items: ['spread:none', 'spread:odd', 'spread:even'] },
    { labelKey: 'commands.scroll.group', items: ['scroll:vertical', 'scroll:horizontal'] },
    { labelKey: 'commands.rotate.group', items: ['rotate:clockwise', 'rotate:counter-clockwise'] },
    { items: ['document:fullscreen'] },
  ],
};

// ── contextual strips (anchored to selections; same BarSchema vocabulary) ────
// which commands actually show is each command's `visible` derivation (group
// only when groupable, style only when the kind declares editable props…), so
// one strip serves single and multi selection.
const annotationStrip: BarSchema = {
  id: 'annotation-strip',
  sections: {
    center: [
      group(
        'annotation-actions',
        [
          'annotation:comment',
          'annotation:style',
          'annotation:stamp-from-selection',
          'annotation:link',
          'annotation:goto-link',
          'annotation:remove-link',
          'annotation:group',
          'annotation:ungroup',
        ],
        { importance: 4 },
      ),
      // Its own group → a derived separator; delete stands apart.
      group('annotation-danger', ['annotation:delete'], { importance: 5 }),
    ],
  },
};

// The text-selection strip: appears when a text selection settles (the menu
// component gates on `isSelecting()`). One command today; "Highlight" et al.
// are one more id here + one command — no component changes.
const selectionStrip: BarSchema = {
  id: 'selection-strip',
  sections: {
    center: [group('selection-actions', ['selection:copy'], { importance: 4 })],
  },
};

/**
 * The default chrome — exported as a value, which is the whole customization
 * model: consumers pass nothing and track this, transform it, or write their
 * own. It is never merged with anything.
 */
export const defaultChrome = defineChrome({
  bars: { main: mainBar },
  modeBars: {
    'mode:annotate': annotateBar,
    'mode:shapes': shapesBar,
    'mode:insert': insertBar,
    'mode:form': formBar,
    'mode:redact': redactBar,
    'mode:measure': measureBar,
  },
  menus: { document: documentMenu, zoom: zoomMenu, 'page-settings': pageSettingsMenu },
  strips: { annotation: annotationStrip, selection: selectionStrip },
});

// Lookups take the resolved schema (the host may have replaced the default) —
// the typed literal widens to arbitrary string keys here, once.

/** Menu lookup by id (arbitrary string). */
export function getMenu(schema: ChromeSchema, id: string): MenuSchema | undefined {
  return (schema.menus as Record<string, MenuSchema> | undefined)?.[id];
}

/** Secondary band lookup by mode-surface id. */
export function getModeBar(schema: ChromeSchema, id: string): BarSchema | undefined {
  return (schema.modeBars as Record<string, BarSchema> | undefined)?.[id];
}

/** Contextual strip lookup by context id ('annotation', …). */
export function getStrip(schema: ChromeSchema, id: string): BarSchema | undefined {
  return (schema.strips as Record<string, BarSchema> | undefined)?.[id];
}
