/**
 * The command vocabulary — the semantic layer. Ported in spirit from the v2
 * snippet's commands.ts, but every command is a pure value: label key, icon,
 * shortcut, derivations, and a `run` (or a declarative surface target). The
 * v2 `registry.getPlugin<T>(id)?.provides()` string-and-cast dance becomes a
 * typed `ctx.get(Token)`.
 *
 * Wiring reality (chrome-parity scope):
 *   zoom/pan/pointer/spread/scroll/rotate  → real Stage / Interaction / PageEdit
 *   modes                                  → shell exclusive surfaces ('mode')
 *   panels / menus / modals                → declarative shell targets
 *   annotate + shape tools                 → real interaction tools
 *   form tools                             → real form plugin palette (draw-to-place)
 *   insert/redact tools                    → inert interaction tools (demo-tools)
 *   history undo/redo                      → disabled (no history plugin in v3 yet)
 */
import type { CommandDef, IconAccent } from '@embedpdf/react/commands';
import { DocumentsToken } from '@embedpdf/react/runtime';
import { StageToken, ZoomMode } from '@embedpdf/react/stage';
import type { SpreadMode } from '@embedpdf/react/stage';
import { InteractionToken } from '@embedpdf/react/interaction';
import { ShellToken } from '@embedpdf/react/shell';
import { AnnotationToken } from '@embedpdf/react/annotation';
import { copySelection, SelectionToken, type TextRange } from '@embedpdf/react/selection';
import { fieldKeyOf, FormToken } from '@embedpdf/react/form';
import { LinkToken, type PdfLinkTarget } from '@embedpdf/react/link';

// ── helpers ────────────────────────────────────────────────────────────────
type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

const stage = (c: Ctx) => c.tryGet(StageToken);
const interaction = (c: Ctx) => c.tryGet(InteractionToken);
const anno = (c: Ctx) => c.tryGet(AnnotationToken);
const textSelection = (c: Ctx) => c.tryGet(SelectionToken);
const sameTextRange = (a: TextRange | null, b: TextRange | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.start.pon === b.start.pon &&
    a.start.index === b.start.index &&
    a.end.pon === b.end.pon &&
    a.end.index === b.end.index);

// ── annotation-selection predicates (drive the floating strip's contents) ────
const hasAnnotationSelection = (c: Ctx) => (anno(c)?.selection().length ?? 0) > 0;
/** v2 gated strip items per subtype (comment hidden on links/widgets) — here
 *  it's one derivation over the selected DTOs instead of per-command lookups. */
const selectionSubtypes = (c: Ctx) => new Set((anno(c)?.getSelected() ?? []).map((a) => a.subtype));
/**
 * The selection's `link` value: a target, `null` (linkable but none set), or
 * `undefined` when the selection cannot carry a link at all (widgets, mixed
 * link states) — the schema decides, never a subtype blocklist.
 */
const selectionLink = (c: Ctx): PdfLinkTarget | null | undefined => {
  const p = anno(c)?.getSelectionProps();
  if (!p || !p.specs.some((s) => s.key === 'link') || p.mixed.includes('link')) return undefined;
  return (p.values.link ?? null) as PdfLinkTarget | null;
};

// ── tool icon accents: THIS viewer's design decision ─────────────────────────
// A tool declares which drawing default each colored part of its glyph previews.
// This is intentionally explicit at the command definition: property-panel order
// does not determine icon meaning, and another viewer may make a different choice.
type ColorKey = 'color' | 'interiorColor' | 'fontColor';
export interface ToolAccentDefinition {
  primary: ColorKey;
  secondary?: ColorKey;
}

/**
 * toolId → the SAME icon + accent definition its toolbar button uses, recorded
 * as a side effect of the `tool()` command definitions below — ONE source of
 * truth, so the tool cursor (ui/tool-cursor.tsx) and the button can never
 * drift apart.
 */
export const TOOL_ICONS: Record<string, { icon: string; accent?: ToolAccentDefinition }> = {};

const toolAccent = (
  c: Ctx,
  toolId: string,
  accent: ToolAccentDefinition | undefined,
): IconAccent | null => {
  if (!accent) return null;
  const anno = c.tryGet(AnnotationToken);
  if (!anno) return null;
  const d = anno.currentDefaults(toolId);
  return {
    primary: d[accent.primary] ?? undefined,
    secondary: accent.secondary ? (d[accent.secondary] ?? undefined) : undefined,
  };
};

/** A tool command: activates a real interaction tool; active = it's the tool.
 *  The icon previews the tool's current defaults — keyed by the SAME toolId
 *  as run/active, so the accent can't drift to another tool's colors. */
const tool = (
  id: string,
  toolId: string,
  labelKey: string,
  icon: string,
  accent?: ToolAccentDefinition,
): CommandDef => {
  TOOL_ICONS[toolId] = { icon, ...(accent ? { accent } : {}) };
  return {
    id,
    labelKey,
    icon,
    categories: ['tool'],
    run: (c) => interaction(c)?.activateTool(toolId),
    active: (c) => interaction(c)?.activeToolId() === toolId,
    enabled: (c) => interaction(c) != null,
    iconAccent: (c) => toolAccent(c, toolId, accent),
  };
};

/** A fixed zoom level (fraction), e.g. 1 = 100%. */
const zoomLevel = (id: string, level: number, label: string): CommandDef => ({
  id,
  labelKey: label,
  categories: ['zoom', 'zoom-level'],
  run: (c) => stage(c)?.zoomTo({ level }),
  enabled: (c) => stage(c) != null,
});

const spread = (id: string, mode: SpreadMode, labelKey: string, icon: string): CommandDef => ({
  id,
  labelKey,
  icon,
  categories: ['page', 'spread'],
  run: (c) => stage(c)?.setSpread(mode),
  active: (c) => stage(c)?.spread() === mode,
  enabled: (c) => stage(c) != null,
});

export const defaultCommands: CommandDef[] = [
  // ── zoom ───────────────────────────────────────────────────────────────
  {
    id: 'zoom:in',
    labelKey: 'commands.zoom.in',
    icon: 'zoomIn',
    shortcut: ['Mod+=', 'Mod+NumpadAdd'],
    categories: ['zoom'],
    run: (c) => stage(c)?.zoomIn(),
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'zoom:out',
    labelKey: 'commands.zoom.out',
    icon: 'zoomOut',
    shortcut: ['Mod+-', 'Mod+NumpadSubtract'],
    categories: ['zoom'],
    run: (c) => stage(c)?.zoomOut(),
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'zoom:fit-page',
    labelKey: 'commands.zoom.fitPage',
    icon: 'fitToPage',
    shortcut: 'Mod+0',
    categories: ['zoom'],
    run: (c) => stage(c)?.fitPage(),
    active: (c) => stage(c)?.zoomMode() === ZoomMode.FitPage,
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'zoom:fit-width',
    labelKey: 'commands.zoom.fitWidth',
    icon: 'fitToWidth',
    shortcut: 'Mod+1',
    categories: ['zoom'],
    run: (c) => stage(c)?.fitWidth(),
    active: (c) => stage(c)?.zoomMode() === ZoomMode.FitWidth,
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'zoom:automatic',
    labelKey: 'commands.zoom.automatic',
    categories: ['zoom'],
    run: (c) => stage(c)?.automatic(),
    active: (c) => stage(c)?.zoomMode() === ZoomMode.Automatic,
    enabled: (c) => stage(c) != null,
  },
  zoomLevel('zoom:50', 0.5, 'commands.zoom.p50'),
  zoomLevel('zoom:100', 1, 'commands.zoom.p100'),
  zoomLevel('zoom:150', 1.5, 'commands.zoom.p150'),
  zoomLevel('zoom:200', 2, 'commands.zoom.p200'),
  zoomLevel('zoom:400', 4, 'commands.zoom.p400'),
  {
    id: 'zoom:menu',
    labelKey: 'commands.zoom.menu',
    icon: 'zoomIn',
    categories: ['zoom'],
    menu: 'zoom',
  },

  // ── tools ──────────────────────────────────────────────────────────────
  {
    id: 'pan:toggle',
    labelKey: 'commands.pan',
    icon: 'hand',
    categories: ['tools'],
    run: (c) => interaction(c)?.activateTool('pan'),
    active: (c) => interaction(c)?.activeToolId() === 'pan',
    enabled: (c) => interaction(c) != null,
  },
  {
    id: 'pointer:toggle',
    labelKey: 'commands.pointer',
    icon: 'pointer',
    categories: ['tools'],
    run: (c) => interaction(c)?.activateTool('pointer'),
    active: (c) => interaction(c)?.activeToolId() === 'pointer',
    enabled: (c) => interaction(c) != null,
  },

  // ── panels (declarative shell targets) ──────────────────────────────────
  {
    id: 'panel:sidebar',
    labelKey: 'commands.sidebar',
    icon: 'sidebar',
    categories: ['panel'],
    panel: { id: 'sidebar', exclusive: 'left' },
  },
  {
    id: 'panel:search',
    labelKey: 'commands.search',
    icon: 'search',
    categories: ['panel'],
    panel: { id: 'search', exclusive: 'right' },
  },
  {
    id: 'panel:comment',
    labelKey: 'commands.comment',
    icon: 'comment',
    categories: ['panel'],
    panel: { id: 'comment', exclusive: 'right' },
  },
  {
    id: 'panel:annotation-style',
    labelKey: 'commands.style',
    icon: 'palette',
    categories: ['panel'],
    panel: { id: 'annotation-style', exclusive: 'right' },
  },

  // ── menus (declarative) ─────────────────────────────────────────────────
  {
    id: 'document:menu',
    labelKey: 'commands.menu',
    icon: 'menu',
    categories: ['document'],
    menu: 'document',
  },
  {
    id: 'page:settings',
    labelKey: 'commands.viewControls',
    icon: 'viewSettings',
    categories: ['page'],
    menu: 'page-settings',
  },

  // ── document actions ────────────────────────────────────────────────────
  {
    id: 'document:download',
    labelKey: 'commands.download',
    icon: 'download',
    categories: ['document'],
    run: (c) => {
      const id = c.documentId ?? undefined;
      c.tryGet(DocumentsToken)
        ?.download(id)
        .then((bytes) => {
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'document.pdf';
          a.click();
          URL.revokeObjectURL(url);
        })
        .catch((e) => console.warn('[snippet-react] download failed', e));
    },
    enabled: (c) => c.tryGet(DocumentsToken) != null && c.documentId != null,
  },
  {
    id: 'document:print',
    labelKey: 'commands.print',
    icon: 'print',
    shortcut: 'Mod+p',
    categories: ['document'],
    run: () => window.print(),
  },
  {
    id: 'document:fullscreen',
    labelKey: 'commands.fullscreen',
    icon: 'externalLink',
    categories: ['document'],
    run: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    },
    active: () => Boolean(document.fullscreenElement),
  },

  // ── page settings (spread / scroll / rotate) ────────────────────────────
  spread('spread:none', 'none', 'commands.spread.none', 'singlePage'),
  spread('spread:odd', 'odd', 'commands.spread.odd', 'doublePage'),
  spread('spread:even', 'even', 'commands.spread.even', 'book2'),
  {
    id: 'scroll:vertical',
    labelKey: 'commands.scroll.vertical',
    icon: 'vertical',
    categories: ['page', 'scroll'],
    run: (c) => stage(c)?.setLayout('vertical'),
    active: (c) => stage(c)?.layout() === 'vertical',
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'scroll:horizontal',
    labelKey: 'commands.scroll.horizontal',
    icon: 'horizontal',
    categories: ['page', 'scroll'],
    run: (c) => stage(c)?.setLayout('horizontal'),
    active: (c) => stage(c)?.layout() === 'horizontal',
    enabled: (c) => stage(c) != null,
  },
  // VIEW rotation (Adobe's "Rotate View"): rotates how every page displays in
  // the main stage lens — non-persistent, nothing written to the PDF. The
  // PERMANENT per-page rotation (PageEditToken.rotateBy) belongs in a
  // page-organize surface, not behind the view-settings buttons.
  {
    id: 'rotate:clockwise',
    labelKey: 'commands.rotate.clockwise',
    icon: 'rotateClockwise',
    categories: ['page', 'rotate'],
    run: (c) => stage(c)?.rotateView(90),
    enabled: (c) => stage(c) != null,
  },
  {
    id: 'rotate:counter-clockwise',
    labelKey: 'commands.rotate.counterclockwise',
    icon: 'rotateCounterClockwise',
    categories: ['page', 'rotate'],
    run: (c) => stage(c)?.rotateView(-90),
    enabled: (c) => stage(c) != null,
  },

  // ── modes (shell exclusive surfaces, tag 'mode') ────────────────────────
  {
    id: 'mode:view',
    labelKey: 'commands.mode.view',
    categories: ['mode'],
    // View = no mode band. Close any open mode surface and drop to pointer.
    run: (c) => {
      const shell = c.tryGet(ShellToken);
      for (const m of MODE_SURFACES) shell?.close(m);
      interaction(c)?.activateTool('pointer');
    },
    active: (c) => {
      const shell = c.tryGet(ShellToken);
      return shell ? MODE_SURFACES.every((m) => !shell.isOpen(m)) : true;
    },
  },
  modeCommand('mode:annotate', 'commands.mode.annotate'),
  modeCommand('mode:shapes', 'commands.mode.shapes'),
  modeCommand('mode:insert', 'commands.mode.insert'),
  modeCommand('mode:form', 'commands.mode.form', 'form-edit'),
  modeCommand('mode:redact', 'commands.mode.redact'),

  // ── annotate tools (real interaction tools) ─────────────────────────────
  tool('annotation:add-highlight', 'highlight', 'commands.annotate.highlight', 'highlight', {
    primary: 'color',
  }),
  tool('annotation:add-strikeout', 'strikeout', 'commands.annotate.strikeout', 'strikethrough', {
    primary: 'color',
  }),
  tool('annotation:add-underline', 'underline', 'commands.annotate.underline', 'underline', {
    primary: 'color',
  }),
  tool('annotation:add-squiggly', 'squiggly', 'commands.annotate.squiggly', 'squiggly', {
    primary: 'color',
  }),
  tool('annotation:add-ink', 'ink', 'commands.annotate.ink', 'pencilMarker', {
    primary: 'color',
  }),
  tool(
    'annotation:add-ink-highlight',
    'ink-highlight',
    'commands.annotate.inkHighlight',
    'inkHighlighter',
    { primary: 'color' },
  ),
  tool('annotation:add-text', 'free-text', 'commands.annotate.text', 'freeText', {
    primary: 'fontColor',
  }),
  tool('annotation:add-insert-text', 'insert-text', 'commands.annotate.insertText', 'insertText', {
    primary: 'color',
  }),
  tool(
    'annotation:add-replace-text',
    'replace-text',
    'commands.annotate.replaceText',
    'replaceText',
    { primary: 'color' },
  ),
  tool('annotation:add-callout', 'free-text-callout', 'commands.annotate.callout', 'callout', {
    primary: 'color',
    secondary: 'interiorColor',
  }),
  // Sticky note ("comment") — click-to-place; the icon renders from the
  // engine-baked /AP in the tool's current color.
  tool('annotation:add-note', 'note', 'commands.annotate.note', 'message'),
  // Link — drag an invisible hit rectangle, then set the target in the style
  // panel's Link control (create-then-edit). While active, existing links
  // become editable rects instead of navigating.
  tool('annotation:add-link', 'link', 'commands.annotate.link', 'link'),

  // ── shape tools (real interaction tools) ────────────────────────────────
  tool('annotation:add-rectangle', 'square', 'commands.shapes.rectangle', 'square', {
    primary: 'color',
    secondary: 'interiorColor',
  }),
  tool('annotation:add-circle', 'circle', 'commands.shapes.circle', 'circle', {
    primary: 'color',
    secondary: 'interiorColor',
  }),
  tool('annotation:add-line', 'line', 'commands.shapes.line', 'line', { primary: 'color' }),
  // The arrow tool is a `line` preset (a line with an arrowhead) — registered by
  // the annotationPlugin `tools` config in App.tsx, activated like any other tool.
  tool('annotation:add-arrow', 'arrow', 'commands.shapes.arrow', 'lineArrow', {
    primary: 'color',
  }),
  tool('annotation:add-polygon', 'polygon', 'commands.shapes.polygon', 'polygon', {
    primary: 'color',
    secondary: 'interiorColor',
  }),
  tool('annotation:add-polyline', 'polyline', 'commands.shapes.polyline', 'zigzag', {
    primary: 'color',
  }),

  // ── insert tools (stamp/attachment real; signature/image inert) ─────────
  tool('insert:add-stamp', 'stamp', 'commands.insert.stamp', 'rubberStamp'),
  // File attachment — click the spot, pick the file (the attachment provider).
  tool('insert:add-attachment', 'attachment', 'commands.insert.attachment', 'paperclip'),
  tool('insert:add-signature', 'signature', 'commands.insert.signature', 'signature'),
  tool('insert:add-image', 'image', 'commands.insert.image', 'photo'),

  // ── form tools (the form plugin's draw-to-place palette) ────────────────
  tool('form:add-textfield', 'form-text', 'commands.form.textfield', 'formTextfield'),
  tool('form:add-checkbox', 'form-checkbox', 'commands.form.checkbox', 'formCheckbox'),
  tool('form:add-radio', 'form-radio', 'commands.form.radio', 'formRadio'),
  tool('form:add-select', 'form-combobox', 'commands.form.select', 'formSelect'),
  tool('form:add-listbox', 'form-listbox', 'commands.form.listbox', 'formListbox'),

  // ── redaction (v2 parity: the toolbar arms the tool; the panel owns the
  // destructive verbs — Apply All / Clear live in the redaction sidebar) ────
  tool('redaction:redact', 'redact', 'commands.redact.mark', 'redactArea'),
  {
    id: 'panel:redaction',
    labelKey: 'commands.redact.panel',
    icon: 'redactionSidebar',
    categories: ['panel'],
    panel: { id: 'redaction', exclusive: 'right' },
  },

  // ── annotation selection (the floating strip's verbs) ──────────────────
  {
    id: 'annotation:delete',
    labelKey: 'commands.annotate.delete',
    icon: 'trash',
    // Backspace/Delete removes the current selection — shapes, free text, ink,
    // stamps, form widgets, and pending redactions are all annotations here, so
    // one binding covers them all. The keymap ignores strokes from editable
    // targets, so typing in a field or the free-text editor is unaffected.
    shortcut: ['Backspace', 'Delete'],
    categories: ['annotation'],
    run: (c) => {
      const a = anno(c);
      if (!a) return;
      const form = c.tryGet(FormToken);
      const dtos = a.getSelected();
      const widgets = form ? dtos.filter((d) => d.subtype === 'widget') : [];
      if (widgets.length === 0) {
        a.deleteSelection();
        return;
      }
      // Widgets are FIELD-plane citizens: deleting one goes through doc.forms
      // (the field and every widget of it cascade), never the raw annotation —
      // otherwise the /AcroForm entry would be orphaned.
      const keys = new Set<string>();
      for (const w of widgets) {
        const objnum = w.ref.kind === 'objectNumber' ? w.ref.annotObjectNumber : 0;
        const field = objnum > 0 ? form!.fieldForWidget(objnum) : null;
        if (field) keys.add(fieldKeyOf(field));
      }
      for (const key of keys) void form!.deleteField(key);
      for (const d of dtos) if (d.subtype !== 'widget') void a.delete(d.ref);
      a.deselect();
    },
    visible: hasAnnotationSelection,
    // Mirrors the engine's own authorization: locked/unauthorized annotations
    // keep the button visible but disabled (the engine still enforces).
    enabled: (c) => {
      const a = anno(c);
      const refs = a?.getSelection() ?? [];
      return refs.length > 0 && refs.every((r) => a!.canDelete(r));
    },
  },
  {
    id: 'annotation:comment',
    labelKey: 'commands.comment',
    icon: 'comment',
    categories: ['annotation'],
    // Same 'comment' surface panel:comment toggles — `active` derives from it.
    panel: { id: 'comment', exclusive: 'right' },
    visible: (c) => hasAnnotationSelection(c) && !selectionSubtypes(c).has('widget'),
  },
  {
    id: 'annotation:style',
    labelKey: 'commands.style',
    icon: 'palette',
    categories: ['annotation'],
    panel: { id: 'annotation-style', exclusive: 'right' },
    // The kind table decides: no declared editable props → no style button
    // (v2 hardcoded a subtype blocklist for this).
    visible: (c) => (anno(c)?.getSelectionProps().specs.length ?? 0) > 0,
  },
  {
    id: 'annotation:group',
    labelKey: 'commands.annotate.group',
    icon: 'group',
    categories: ['annotation'],
    run: (c) => void anno(c)?.group(),
    visible: (c) => anno(c)?.canGroup() ?? false,
  },
  {
    id: 'annotation:ungroup',
    labelKey: 'commands.annotate.ungroup',
    icon: 'ungroup',
    categories: ['annotation'],
    run: (c) => void anno(c)?.ungroup(),
    visible: (c) => anno(c)?.canUngroup() ?? false,
  },

  // ── text selection (the selection strip's verbs) ────────────────────────
  {
    id: 'selection:copy',
    labelKey: 'commands.selection.copy',
    icon: 'copy',
    categories: ['selection'],
    // The permission story rides `visible`: a deployment denying
    // doc.text.copy shows no Copy at all — and with zero visible commands
    // the strip renders nothing, so there is never an empty bubble.
    visible: (c) => {
      const s = textSelection(c);
      return !!s && s.hasSelection() && s.canCopy();
    },
    // Async Clipboard write inside the click's activation window; instant
    // when <SelectionClipboard>'s commit prefetch already fetched the text.
    // A successful copy consumes the selection, which also dismisses its strip.
    run: (c) => {
      const s = textSelection(c);
      if (!s) return;
      const copiedRange = s.snapshot().range;
      void copySelection(s).then(
        (text) => {
          // Clipboard writes can outlive the click. Never let an older copy
          // completion clear a newer selection the user made in the meantime.
          if (text !== '' && sameTextRange(s.snapshot().range, copiedRange)) s.clear();
        },
        () => {}, // Copy failed: preserve the selection so the user can retry.
      );
    },
  },

  // ── link strip items (v2's "Link / Go to link / Remove link") ───────────
  {
    // Make the selection a link: opens the style panel, whose Link control
    // sets the target (create-then-edit — the plugin materializes the
    // attached child annotations).
    id: 'annotation:link',
    labelKey: 'commands.annotate.link',
    icon: 'link',
    categories: ['annotation'],
    panel: { id: 'annotation-style', exclusive: 'right' },
    visible: (c) => selectionLink(c) === null,
  },
  {
    id: 'annotation:goto-link',
    labelKey: 'commands.annotate.gotoLink',
    icon: 'externalLink',
    categories: ['annotation'],
    run: (c) => {
      const target = selectionLink(c);
      if (target) c.tryGet(LinkToken)?.activate(target);
    },
    visible: (c) => selectionLink(c) != null,
  },
  {
    id: 'annotation:remove-link',
    labelKey: 'commands.annotate.removeLink',
    icon: 'linkOff',
    categories: ['annotation'],
    run: (c) => anno(c)?.updateSelection({ link: null }),
    visible: (c) => selectionLink(c) != null,
  },

  // ── history (no plugin yet → disabled, shows the disabled styling) ──────
  {
    id: 'history:undo',
    labelKey: 'commands.undo',
    icon: 'arrowBackUp',
    categories: ['history'],
    run: () => {},
    enabled: () => false,
  },
  {
    id: 'history:redo',
    labelKey: 'commands.redo',
    icon: 'arrowForwardUp',
    categories: ['history'],
    run: () => {},
    enabled: () => false,
  },
];

// ── mode helpers ─────────────────────────────────────────────────────────────
// Modes are exclusive shell surfaces tagged 'mode'; the secondary band renders
// whichever one is open. Kept below the array to keep the list readable.
export const MODE_SURFACES = [
  'mode:annotate',
  'mode:shapes',
  'mode:insert',
  'mode:form',
  'mode:redact',
] as const;

function modeCommand(
  id: (typeof MODE_SURFACES)[number],
  labelKey: string,
  toolId: string = 'pointer',
): CommandDef {
  return {
    id,
    labelKey,
    categories: ['mode'],
    // A mode tab is a shell surface AND a tool policy: the Form tab flips the
    // pointer into form design ('form-edit' — widgets select/move/resize like
    // annotations); every other tab (and closing one) drops back to the
    // default pointer, where widgets are fill controls again.
    run: (c) => {
      const shell = c.tryGet(ShellToken);
      shell?.toggle(id, { exclusive: 'mode' });
      interaction(c)?.activateTool(shell?.isOpen(id) ? toolId : 'pointer');
    },
    active: (c) => c.tryGet(ShellToken)?.isOpen(id) ?? false,
  };
}
