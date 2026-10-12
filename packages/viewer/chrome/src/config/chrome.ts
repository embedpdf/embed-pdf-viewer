/**
 * The default layout: every bar, menu and panel the viewer ships, as plain
 * data. Structure only: no breakpoints, no show/hide lists, no locale
 * overrides, no dividers or spacers, no hand-written overflow menus. What fits
 * is measured and solved at runtime (@embedpdf/core-ui); the "More" menu is
 * derived, and so are the mode tabs (the `modes` group lists one per bar with
 * a `mode`).
 *
 * `importance` (1 makes room first … 5 never leaves the bar) is the only
 * responsive knob. The bar, group and menu ids are API: they don't change
 * between minor versions.
 */
import { createLayout, type LayoutData, type LayoutGroupObject } from '@embedpdf/core-ui';

// Shared by the mode bars: plain values, so composition is just a const.
const style: LayoutGroupObject = { id: 'style', items: ['panel:style'], importance: 4 };
const history: LayoutGroupObject = {
  id: 'history',
  items: ['history:undo', 'history:redo'],
  importance: 3,
};

export const DEFAULT_LAYOUT: LayoutData = {
  bars: {
    main: {
      place: 'top',
      // The start section sits left-aligned: document menu, view, the zoom
      // field, pan and pointer. Only the mode tabs are truly centered.
      start: [
        { id: 'document', items: ['menu:document'], importance: 5 },
        {
          id: 'view',
          items: [{ command: 'panel:thumbnails', importance: 5 }, 'menu:view'],
          importance: 4,
        },
        // The zoom field; when it can't fit it draws its 'button' variant,
        // and in the "More" menu it stands in as menu:zoom.
        {
          id: 'zoom',
          items: [{ custom: 'zoom', command: 'menu:zoom', variants: ['inline', 'button'] }],
          importance: 4,
        },
        { id: 'tools', items: ['tool:pan', 'tool:pointer'], importance: 2 },
      ],
      center: [
        {
          // The tabs: View, then one per mode bar. The group ladder: full strip
          // → trailing tabs shed behind a chevron → select → the "More" menu.
          // The tabs sit at importance 1 so the strip compacts first; the group
          // at 4 so its compact forms last.
          id: 'modes',
          items: [],
          shed: true,
          collapse: 'select',
          importance: 4,
          titleKey: 'commands.mode.group',
        },
      ],
      end: [{ id: 'panels', items: ['panel:search', 'panel:comments'], importance: 5 }],
    },

    // ── the mode bars: along main, one at a time ──────────────────────────────
    annotate: {
      place: { with: 'main' },
      mode: 'annotate',
      titleKey: 'commands.mode.annotate',
      center: [
        { id: 'comment', items: ['tool:note', 'tool:link'], importance: 4 },
        {
          id: 'markup',
          items: ['tool:highlight', 'tool:strikeout', 'tool:underline', 'tool:squiggly'],
          importance: 4,
        },
        { id: 'draw', items: ['tool:ink', 'tool:ink-highlight'], importance: 3 },
        {
          id: 'text',
          items: ['tool:free-text', 'tool:insert-text', 'tool:replace-text', 'tool:callout'],
          importance: 2,
        },
        style,
        history,
      ],
    },
    shapes: {
      place: { with: 'main' },
      mode: 'shapes',
      titleKey: 'commands.mode.shapes',
      center: [
        {
          id: 'shapes',
          items: ['tool:square', 'tool:circle', 'tool:line', 'tool:arrow'],
          importance: 4,
        },
        { id: 'polygons', items: ['tool:polygon', 'tool:polyline'], importance: 2 },
        style,
        history,
      ],
    },
    insert: {
      place: { with: 'main' },
      mode: 'insert',
      titleKey: 'commands.mode.insert',
      center: [
        {
          id: 'stamps',
          items: [
            'tool:stamp',
            // Quick marks (`stamps.toolbar`): thumbnails that arm on click; in
            // a menu the stamps panel stands in for them.
            { custom: 'quick-stamps', command: 'tool:stamp', importance: 3 },
            'tool:attachment',
            'tool:signature',
            'tool:image',
          ],
          importance: 4,
        },
        style,
        history,
      ],
    },
    form: {
      place: { with: 'main' },
      mode: 'form',
      titleKey: 'commands.mode.form',
      center: [
        { id: 'fields', items: ['tool:text-field', 'tool:checkbox', 'tool:radio'], importance: 4 },
        { id: 'choices', items: ['tool:combo-box', 'tool:list-box'], importance: 2 },
        { id: 'signatures', items: ['tool:signature-field'], importance: 2 },
        history,
      ],
    },
    redact: {
      place: { with: 'main' },
      mode: 'redact',
      titleKey: 'commands.mode.redact',
      center: [
        { id: 'redact', items: ['tool:redact', 'panel:redaction'], importance: 4 },
        style,
        history,
      ],
    },
    measure: {
      place: { with: 'main' },
      mode: 'measure',
      titleKey: 'commands.mode.measure',
      center: [
        {
          id: 'measure',
          items: ['tool:distance', 'tool:perimeter', 'tool:area', 'measurement:calibrate'],
          importance: 5,
        },
        {
          id: 'scale',
          items: [
            { custom: 'measurement-scale', command: 'panel:measurement', variants: ['inline'] },
          ],
          importance: 4,
        },
        style,
      ],
    },

    // ── over the pages ────────────────────────────────────────────────────────
    pager: {
      place: { float: 'bottom' },
      center: [{ id: 'pages', items: [{ custom: 'page-number' }] }],
    },
    // Which actions show is each command's `visible` (group only when
    // groupable, style only when the kind has editable properties…), so one
    // bar serves a single and a multiple selection.
    selection: {
      place: { at: 'selection' },
      center: [{ id: 'selection', items: ['selection:copy'], importance: 4 }],
    },
    annotation: {
      place: { at: 'annotation' },
      center: [
        {
          id: 'actions',
          items: [
            'annotation:comment',
            'annotation:style',
            'annotation:stamp-from-selection',
            'annotation:link',
            'annotation:goto-link',
            'annotation:remove-link',
            'annotation:group',
            'annotation:ungroup',
          ],
          importance: 4,
        },
        // Its own group, so a line sets delete apart.
        { id: 'danger', items: ['annotation:delete'], importance: 5 },
      ],
    },
  },

  menus: {
    document: [['document:download', 'document:print'], ['view:fullscreen']],
    view: [
      {
        titleKey: 'commands.spread.group',
        items: ['view:single-page', 'view:two-pages', 'view:cover-page'],
      },
      {
        titleKey: 'commands.scroll.group',
        items: ['view:scroll-vertical', 'view:scroll-horizontal'],
      },
      {
        titleKey: 'commands.rotate.group',
        items: ['view:rotate-clockwise', 'view:rotate-counterclockwise'],
      },
      ['view:fullscreen'],
    ],
    zoom: [
      {
        titleKey: 'commands.zoom.level',
        items: ['zoom:50', 'zoom:100', 'zoom:150', 'zoom:200', 'zoom:400'],
      },
      ['zoom:in', 'zoom:out'],
      ['zoom:fit-page', 'zoom:fit-width', 'zoom:automatic'],
    ],
  },

  panels: {
    thumbnails: { side: 'start' },
    outline: { side: 'start' },
    attachments: { side: 'start' },
    search: { side: 'end' },
    comments: { side: 'end' },
    style: { side: 'end' },
    stamps: { side: 'end' },
    signatures: { side: 'end' },
    redaction: { side: 'end' },
    measurement: { side: 'end' },
  },
};

/** The default layout, which the `layout` function gets. */
export const defaultLayout = createLayout(DEFAULT_LAYOUT);
