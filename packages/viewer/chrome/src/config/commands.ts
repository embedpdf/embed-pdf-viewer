/**
 * The command vocabulary — the semantic layer. Every command is a pure value:
 * label key, icon, shortcut, derivations, and a `run` (or a declarative
 * surface target). Commands reach plugins through a typed
 * `commandContext.tryGet(Token)`, never by string id and cast.
 *
 * Wiring:
 *   zoom/pan/pointer/spread/scroll/rotate  → real Stage / Interaction / PageEdit
 *   modes                                  → shell exclusive surfaces ('mode')
 *   panels / menus / modals                → declarative shell targets
 *   annotate + shape tools                 → real interaction tools
 *   form tools                             → real form plugin palette (draw-to-place)
 *   insert tools                           → real stamp and signature panels +
 *                                            image/attachment click-then-pick
 *   history undo/redo                      → disabled (there is no history plugin)
 */
import type { CommandDef, IconAccent } from '@embedpdf/react/commands';
import { DocumentsToken } from '@embedpdf/react/runtime';
import { StageToken, ZoomMode } from '@embedpdf/react/stage';
import type { SpreadMode } from '@embedpdf/react/stage';
import { InteractionToken } from '@embedpdf/react/interaction';
import { ShellToken } from '@embedpdf/react/shell';
import { AnnotationToken } from '@embedpdf/react/annotation';
import { copySelection, SelectionToken, type TextRange } from '@embedpdf/react/selection';
import { FormToken, type FormFieldRef } from '@embedpdf/react/form';
import { ActionsToken } from '@embedpdf/react/actions';
import { LinkToken, openLinkTarget, type PdfLinkTarget } from '@embedpdf/react/link';
import { SearchToken } from '@embedpdf/react/search';
import { MeasurementToken } from '@embedpdf/react/measurement';
import { RedactionToken } from '@embedpdf/react/redaction';
import { StampToken } from '@embedpdf/react/stamp';
import { SignatureToken } from '@embedpdf/react/signature';
import { I18nToken } from '@embedpdf/react/i18n';

// ── helpers ────────────────────────────────────────────────────────────────
type Ctx = Parameters<NonNullable<CommandDef['run']>>[0];

/** Where selection-made stamps go: the user's own library, persisted. */
const CUSTOM_LIBRARY_ID = 'embedpdf-custom';

const stage = (commandContext: Ctx) => commandContext.tryGet(StageToken);
const interaction = (commandContext: Ctx) => commandContext.tryGet(InteractionToken);
const anno = (commandContext: Ctx) => commandContext.tryGet(AnnotationToken);
const textSelection = (commandContext: Ctx) => commandContext.tryGet(SelectionToken);
const sameTextRange = (left: TextRange | null, right: TextRange | null): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.start.page.pageObjectNumber === right.start.page.pageObjectNumber &&
    left.start.index === right.start.index &&
    left.end.page.pageObjectNumber === right.end.page.pageObjectNumber &&
    left.end.index === right.end.index);

// ── annotation-selection predicates (drive the floating strip's contents) ────
const hasAnnotationSelection = (commandContext: Ctx) =>
  (anno(commandContext)?.getSelection().length ?? 0) > 0;
/** Strip items gate per subtype (comment hidden on links/widgets) through
 *  one derivation over the selected DTOs, not per-command lookups. */
const selectionSubtypes = (commandContext: Ctx) =>
  new Set((anno(commandContext)?.listSelected() ?? []).map((annotation) => annotation.subtype));
/**
 * The selection's `link` value: a target, `null` (linkable but none set), or
 * `undefined` when the selection cannot carry a link at all (widgets, mixed
 * link states) — the schema decides, never a subtype blocklist.
 */
const selectionLink = (commandContext: Ctx): PdfLinkTarget | null | undefined => {
  const props = anno(commandContext)?.getSelectionProps();
  if (!props || !props.specs.some((spec) => spec.key === 'link') || props.mixed.includes('link'))
    return undefined;
  return (props.values.link ?? null) as PdfLinkTarget | null;
};

// ── tool icon accents: This viewer's design decision ─────────────────────────
// A tool declares which drawing default each colored part of its glyph previews.
// This is intentionally explicit at the command definition: property-panel order
// does not determine icon meaning, and another viewer may make a different choice.
type ColorKey = 'color' | 'interiorColor' | 'fontColor';
export interface ToolAccentDefinition {
  primary: ColorKey;
  secondary?: ColorKey;
}

/**
 * toolId → the same icon + accent definition its toolbar button uses, recorded
 * as a side effect of the `tool()` command definitions below — one source of
 * truth, so the tool cursor (ui/tool-cursor.tsx) and the button can never
 * drift apart.
 */
export const TOOL_ICONS: Record<string, { icon: string; accent?: ToolAccentDefinition }> = {};

// The `stamp` tool has no toolbar button of its own: it is armed by the stamps
// panel (picking a library asset), never activated directly — so its cursor
// skin is recorded here rather than as a side effect of a `tool()` definition.
TOOL_ICONS['stamp'] = { icon: 'rubberStamp' };

const toolAccent = (
  commandContext: Ctx,
  toolId: string,
  accent: ToolAccentDefinition | undefined,
): IconAccent | null => {
  if (!accent) return null;
  const anno = commandContext.tryGet(AnnotationToken);
  if (!anno) return null;
  const props = anno.getToolDefaults(toolId);
  return {
    primary: props[accent.primary] ?? undefined,
    secondary: accent.secondary ? (props[accent.secondary] ?? undefined) : undefined,
  };
};

/** A tool command: activates a real interaction tool; active = it's the tool.
 *  The icon previews the tool's current defaults — keyed by the same toolId
 *  as run/active, so the accent can't drift to another tool's colors. */
const tool = (
  id: string,
  toolId: string,
  labelKey: string,
  icon: string,
  accent?: ToolAccentDefinition,
): CommandDef => {
  TOOL_ICONS[toolId] = { icon, ...(accent ? { accent } : {}) };
  // Authoring tools grey out without their family's authority — the same
  // twin the owning plugin's gesture gate consults (permissions.md), so a
  // button can never offer a doomed paint: annotation/insert tools ask
  // annotation create authority, form-design tools ask `form.canDesign()`,
  // the redact marker asks `redaction.canMark()`. Absent plugin → ungated
  // (a build without the plugin has no authority question to ask).
  const authority: ((commandContext: Ctx) => boolean) | null =
    id.startsWith('annotation:add') || id.startsWith('insert:add')
      ? (commandContext) => anno(commandContext)?.canCreate() ?? true
      : id.startsWith('form:add')
        ? (commandContext) => commandContext.tryGet(FormToken)?.canDesign() ?? true
        : id === 'redaction:redact'
          ? (commandContext) => commandContext.tryGet(RedactionToken)?.canMark() ?? true
          : null;
  return {
    id,
    labelKey,
    icon,
    categories: ['tool'],
    run: (commandContext) => interaction(commandContext)?.activateTool(toolId),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === toolId,
    enabled: (commandContext) =>
      interaction(commandContext) != null && (authority?.(commandContext) ?? true),
    iconAccent: (commandContext) => toolAccent(commandContext, toolId, accent),
  };
};

/** A fixed zoom level (fraction), e.g. 1 = 100%. */
const zoomLevel = (id: string, level: number, label: string): CommandDef => ({
  id,
  labelKey: label,
  categories: ['zoom', 'zoom-level'],
  run: (commandContext) => stage(commandContext)?.zoomTo({ level }),
  enabled: (commandContext) => stage(commandContext) != null,
});

const spread = (id: string, mode: SpreadMode, labelKey: string, icon: string): CommandDef => ({
  id,
  labelKey,
  icon,
  categories: ['page', 'spread'],
  run: (commandContext) => stage(commandContext)?.setSpread(mode),
  active: (commandContext) => stage(commandContext)?.getSettings().spread === mode,
  enabled: (commandContext) => stage(commandContext) != null,
});

export const defaultCommands: CommandDef[] = [
  // ── zoom ───────────────────────────────────────────────────────────────
  {
    id: 'zoom:in',
    labelKey: 'commands.zoom.in',
    icon: 'zoomIn',
    shortcut: ['Mod+=', 'Mod+NumpadAdd'],
    categories: ['zoom'],
    run: (commandContext) => stage(commandContext)?.zoomIn(),
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:out',
    labelKey: 'commands.zoom.out',
    icon: 'zoomOut',
    shortcut: ['Mod+-', 'Mod+NumpadSubtract'],
    categories: ['zoom'],
    run: (commandContext) => stage(commandContext)?.zoomOut(),
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:fit-page',
    labelKey: 'commands.zoom.fitPage',
    icon: 'fitToPage',
    shortcut: 'Mod+0',
    categories: ['zoom'],
    run: (commandContext) => stage(commandContext)?.fitPage(),
    active: (commandContext) => stage(commandContext)?.getZoomMode() === ZoomMode.FitPage,
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:fit-width',
    labelKey: 'commands.zoom.fitWidth',
    icon: 'fitToWidth',
    shortcut: 'Mod+1',
    categories: ['zoom'],
    run: (commandContext) => stage(commandContext)?.fitWidth(),
    active: (commandContext) => stage(commandContext)?.getZoomMode() === ZoomMode.FitWidth,
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:automatic',
    labelKey: 'commands.zoom.automatic',
    categories: ['zoom'],
    run: (commandContext) => stage(commandContext)?.fitAutomatic(),
    active: (commandContext) => stage(commandContext)?.getZoomMode() === ZoomMode.Automatic,
    enabled: (commandContext) => stage(commandContext) != null,
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
    run: (commandContext) => interaction(commandContext)?.activateTool('pan'),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'pan',
    enabled: (commandContext) => interaction(commandContext) != null,
  },
  {
    id: 'pointer:toggle',
    labelKey: 'commands.pointer',
    icon: 'pointer',
    categories: ['tools'],
    run: (commandContext) => interaction(commandContext)?.activateTool('pointer'),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'pointer',
    enabled: (commandContext) => interaction(commandContext) != null,
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
    // No doc.text.search → every query would 403; the panel has no job.
    visible: (commandContext) => commandContext.tryGet(SearchToken)?.canSearch() ?? true,
    categories: ['panel'],
    panel: { id: 'search', exclusive: 'right' },
  },
  {
    id: 'panel:comment',
    labelKey: 'commands.comment',
    icon: 'comment',
    // No doc.annotate.read → there is nothing this panel could show.
    visible: (commandContext) => anno(commandContext)?.canRead() ?? true,
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
    run: (commandContext) => {
      const id = commandContext.documentId ?? undefined;
      const documents = commandContext.tryGet(DocumentsToken);
      if (!documents) return;
      const pull = () => documents.save(id);
      // The actions plugin owns the save verb: WillSave → serialize → DidSave
      // run as one queued operation, so the WillSave mutations are in the
      // downloaded bytes and two rapid saves can never interleave. Without the
      // actions plugin this degrades to a plain download.
      const actions = commandContext.tryGet(ActionsToken);
      (actions ? actions.runDocumentVerb('save', pull) : pull())
        .then((bytes) => {
          const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'document.pdf';
          anchor.click();
          URL.revokeObjectURL(url);
        })
        .catch((error) => console.warn('[snippet-react] download failed', error));
    },
    // The permissions.md chrome exception: a kernel verb with a 1:1
    // capability reads the kernel's `allows` directly — no owning plugin.
    enabled: (commandContext) =>
      commandContext.documentId != null &&
      (commandContext.tryGet(DocumentsToken)?.allows('doc.download') ?? false),
  },
  {
    id: 'document:print',
    labelKey: 'commands.print',
    icon: 'print',
    shortcut: 'Mod+p',
    categories: ['document'],
    // WP → window.print() → DP through the one serialized verb op (the
    // latch suppresses any nested script print); documentless chrome (or
    // no actions plugin) keeps today's direct dialog.
    run: (commandContext) => {
      const actions =
        commandContext.documentId != null ? commandContext.tryGet(ActionsToken) : null;
      if (actions) void actions.runDocumentVerb('print', () => window.print());
      else window.print();
    },
    // Same exception; documentless chrome (no doc open) keeps print enabled
    // for whatever the host page shows.
    enabled: (commandContext) =>
      commandContext.documentId == null ||
      (commandContext.tryGet(DocumentsToken)?.allows('doc.print') ?? true),
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
    run: (commandContext) => stage(commandContext)?.setLayout('vertical'),
    active: (commandContext) => stage(commandContext)?.getSettings().layout === 'vertical',
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'scroll:horizontal',
    labelKey: 'commands.scroll.horizontal',
    icon: 'horizontal',
    categories: ['page', 'scroll'],
    run: (commandContext) => stage(commandContext)?.setLayout('horizontal'),
    active: (commandContext) => stage(commandContext)?.getSettings().layout === 'horizontal',
    enabled: (commandContext) => stage(commandContext) != null,
  },
  // View rotation (Adobe's "Rotate View"): rotates how every page displays in
  // the main stage lens — non-persistent, nothing written to the PDF. The
  // permanent per-page rotation (PageEditToken.rotateBy) belongs in a
  // page-organize surface, not behind the view-settings buttons.
  {
    id: 'rotate:clockwise',
    labelKey: 'commands.rotate.clockwise',
    icon: 'rotateClockwise',
    categories: ['page', 'rotate'],
    run: (commandContext) => stage(commandContext)?.rotateViewBy(90),
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'rotate:counter-clockwise',
    labelKey: 'commands.rotate.counterclockwise',
    icon: 'rotateCounterClockwise',
    categories: ['page', 'rotate'],
    run: (commandContext) => stage(commandContext)?.rotateViewBy(-90),
    enabled: (commandContext) => stage(commandContext) != null,
  },

  // ── modes (shell exclusive surfaces, tag 'mode') ────────────────────────
  {
    id: 'mode:view',
    labelKey: 'commands.mode.view',
    categories: ['mode'],
    // View = no mode band. Close any open mode surface and drop to pointer.
    run: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      for (const surface of MODE_SURFACES) shell?.close(surface);
      interaction(commandContext)?.activateTool('pointer');
    },
    active: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      return shell ? MODE_SURFACES.every((surface) => !shell.isOpen(surface)) : true;
    },
  },
  modeCommand('mode:annotate', 'commands.mode.annotate'),
  modeCommand('mode:shapes', 'commands.mode.shapes'),
  modeCommand('mode:insert', 'commands.mode.insert'),
  modeCommand('mode:form', 'commands.mode.form', 'form-edit'),
  modeCommand('mode:redact', 'commands.mode.redact'),
  modeCommand('mode:measure', 'commands.mode.measure'),

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

  // ── insert tools (stamp/image/attachment real; signature inert) ─────────
  // Stamps open a library, they are not a file dialog: the panel lists the
  // reusable named assets the stamp plugin holds, and picking one arms the
  // annotation plugin's stamp tool with that asset's bytes (stamps-panel.tsx).
  // Arbitrary image bytes are `insert:add-image` below — a different gesture,
  // so a different button.
  {
    id: 'insert:add-stamp',
    labelKey: 'commands.insert.stamp',
    icon: 'rubberStamp',
    // No stamp plugin → no library to show. No create authority → nothing the
    // picker could place (the same twin every insert tool's button asks).
    visible: (commandContext) => commandContext.tryGet(StampToken) != null,
    enabled: (commandContext) => anno(commandContext)?.canCreate() ?? true,
    categories: ['panel'],
    panel: { id: 'stamps', exclusive: 'right' },
  },
  // File attachment — click the spot, pick the file (the attachment provider).
  tool('insert:add-attachment', 'attachment', 'commands.insert.attachment', 'paperclip'),
  // Signatures open the people panel (libraries of kind 'signatures'): pick a
  // mark → with a target field it signs (or fills) it, else it arms — a click
  // on a signature field signs, anywhere else drops a stamp (Preview).
  {
    id: 'insert:add-signature',
    labelKey: 'commands.insert.signature',
    icon: 'signature',
    visible: (commandContext) =>
      commandContext.tryGet(StampToken) != null && commandContext.tryGet(SignatureToken) != null,
    enabled: (commandContext) => anno(commandContext)?.canCreate() ?? true,
    categories: ['panel'],
    panel: { id: 'signatures', exclusive: 'right' },
  },
  // Image — the click-then-pick placement: click the spot, the file dialog
  // opens (narrowed to rasters), the picture lands where you clicked. The
  // tool itself is a `stamp` preset registered in viewer.tsx.
  tool('insert:add-image', 'image', 'commands.insert.image', 'photo'),

  // ── form tools (the form plugin's draw-to-place palette) ────────────────
  tool('form:add-textfield', 'form-text', 'commands.form.textfield', 'formTextfield'),
  tool('form:add-checkbox', 'form-checkbox', 'commands.form.checkbox', 'formCheckbox'),
  tool('form:add-radio', 'form-radio', 'commands.form.radio', 'formRadio'),
  tool('form:add-select', 'form-combobox', 'commands.form.select', 'formSelect'),
  tool('form:add-listbox', 'form-listbox', 'commands.form.listbox', 'formListbox'),
  tool('form:add-signature', 'form-signature', 'commands.form.signature', 'signature'),

  // ── redaction (the toolbar arms the tool; the panel owns the destructive
  // verbs — Apply All / Clear live in the redaction sidebar) ─────────────────
  tool('redaction:redact', 'redact', 'commands.redact.mark', 'redactArea'),
  {
    id: 'panel:redaction',
    labelKey: 'commands.redact.panel',
    icon: 'redactionSidebar',
    // Useful to a session that can propose marks or apply them; with neither
    // power the panel could only display other people's pending marks.
    visible: (commandContext) => {
      const redaction = commandContext.tryGet(RedactionToken);
      return redaction ? redaction.canMark() || redaction.canApply() : true;
    },
    categories: ['panel'],
    panel: { id: 'redaction', exclusive: 'right' },
  },

  {
    ...tool('measurement:distance', 'distance', 'measurement.distance', 'distance', {
      primary: 'color',
    }),
    enabled: (commandContext) => {
      const page = stage(commandContext)?.getCurrentPage()?.ref;
      return page != null && (commandContext.tryGet(MeasurementToken)?.canMeasure(page) ?? false);
    },
  },
  {
    ...tool('measurement:perimeter', 'perimeter', 'measurement.perimeter', 'perimeter', {
      primary: 'color',
    }),
    enabled: (commandContext) => {
      const page = stage(commandContext)?.getCurrentPage()?.ref;
      return page != null && (commandContext.tryGet(MeasurementToken)?.canMeasure(page) ?? false);
    },
  },
  {
    ...tool('measurement:area', 'area', 'measurement.area', 'area', {
      primary: 'color',
    }),
    enabled: (commandContext) => {
      const page = stage(commandContext)?.getCurrentPage()?.ref;
      return page != null && (commandContext.tryGet(MeasurementToken)?.canMeasure(page) ?? false);
    },
  },
  {
    id: 'measurement:calibrate',
    labelKey: 'measurement.calibrate',
    icon: 'calibrate',
    categories: ['tool'],
    enabled: (commandContext) => commandContext.tryGet(MeasurementToken)?.canCalibrate() ?? false,
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'calibrate',
    run: (commandContext) => commandContext.tryGet(MeasurementToken)?.startCalibration(),
  },
  {
    id: 'panel:measurement',
    labelKey: 'measurement.title',
    icon: 'updateScale',
    categories: ['panel'],
    panel: { id: 'measurement', exclusive: 'right' },
  },

  // ── annotation selection (the floating strip's verbs) ──────────────────
  {
    id: 'annotation:cancel-creation',
    labelKey: 'commands.annotate.cancelCreation',
    categories: ['annotation'],
    shortcut: 'Escape',
    enabled: (commandContext) => anno(commandContext)?.hasCreationDraft() ?? false,
    run: (commandContext) => anno(commandContext)?.cancelCreationDraft(),
  },
  {
    id: 'annotation:delete',
    labelKey: 'commands.annotate.delete',
    icon: 'trash',
    categories: ['annotation'],
    run: (commandContext) => {
      const annotation = anno(commandContext);
      if (!annotation) return;
      const form = commandContext.tryGet(FormToken);
      const dtos = annotation.listSelected();
      const isWidget = (subtype: string) => subtype.startsWith('widget');
      const widgets = form ? dtos.filter((annotation) => isWidget(annotation.subtype)) : [];
      if (widgets.length === 0) {
        void annotation.deleteSelection();
        return;
      }
      // Widgets are field-plane citizens: deleting one goes through doc.forms
      // (the field and every widget of it cascade), never the raw annotation —
      // otherwise the /AcroForm entry would be orphaned.
      const fields = new Map<number, FormFieldRef>();
      for (const annotation of widgets) {
        const field = form!.getFieldForWidget(annotation.ref);
        if (field) fields.set(field.fieldObjectNumber, field.ref);
      }
      for (const ref of fields.values()) void form!.deleteField(ref);
      for (const dto of dtos) if (!isWidget(dto.subtype)) void annotation.delete(dto.ref);
      annotation.clearSelection();
    },
    visible: hasAnnotationSelection,
    // Mirrors the engine's own authorization: locked/unauthorized annotations
    // keep the button visible but disabled (the engine still enforces).
    enabled: (commandContext) => {
      const annotation = anno(commandContext);
      const refs = annotation?.getSelection() ?? [];
      return refs.length > 0 && refs.every((ref) => annotation!.canDelete(ref));
    },
  },
  {
    id: 'annotation:comment',
    labelKey: 'commands.comment',
    icon: 'comment',
    categories: ['annotation'],
    // Same 'comment' surface panel:comment toggles — `active` derives from it.
    panel: { id: 'comment', exclusive: 'right' },
    visible: (commandContext) =>
      hasAnnotationSelection(commandContext) && !selectionSubtypes(commandContext).has('widget'),
  },
  {
    id: 'annotation:style',
    labelKey: 'commands.style',
    icon: 'palette',
    categories: ['annotation'],
    panel: { id: 'annotation-style', exclusive: 'right' },
    // The kind table decides: no declared editable props → no style button.
    visible: (commandContext) => (anno(commandContext)?.getSelectionProps().specs.length ?? 0) > 0,
  },
  {
    // The selection becomes a reusable stamp: the engine flattens the
    // selected appearances into one page (vector, positions kept) and the
    // stamp plugin files it under the user's own library — persisted like
    // any library, exportable as a PDF Acrobat reads.
    id: 'annotation:stamp-from-selection',
    labelKey: 'commands.annotate.stampFromSelection',
    icon: 'rubberStampPlus',
    categories: ['annotation'],
    run: (commandContext) => {
      const annotation = anno(commandContext);
      const stamp = commandContext.tryGet(StampToken);
      const documentId = commandContext.documentId;
      if (!annotation || !stamp || documentId == null) return;
      const dtos = annotation.listSelected();
      const page = dtos[0]?.ref.page;
      if (page === undefined) return;
      const i18n = commandContext.tryGet(I18nToken);
      const label = i18n?.t('demo.stampsCustomLabel') ?? 'Custom stamp';
      const libraryName = i18n?.t('demo.stampsCustomLibrary') ?? 'My stamps';
      const libraryId = CUSTOM_LIBRARY_ID;
      const ensureLibrary = stamp.getLibrary(libraryId)
        ? Promise.resolve(libraryId)
        : stamp.createLibrary(libraryName, { id: libraryId, categories: ['custom'] });
      ensureLibrary
        .then((id) =>
          stamp.createAssetFromAnnotations(
            documentId,
            page,
            dtos.map((annotation) => annotation.ref),
            { libraryId: id, label: `${label} ${stamp.listAssets({ libraryId: id }).length + 1}` },
          ),
        )
        // Open the stamps sidebar on the custom library; the panel reads the
        // surface's open props for its picker.
        .then(() =>
          commandContext.tryGet(ShellToken)?.open('stamps', {
            exclusive: 'right',
            props: { libraryId },
          }),
        )
        .catch((error) => console.warn('[embedpdf] stamp from selection failed', error));
    },
    // One page, no widgets (a form field is not artwork), no pending
    // redaction marks, and a library to put it in. The engine refuses hidden
    // or appearance-less annotations itself — all-or-nothing, never a stamp
    // missing a part.
    visible: (commandContext) =>
      commandContext.tryGet(StampToken) != null &&
      hasAnnotationSelection(commandContext) &&
      !selectionSubtypes(commandContext).has('widget') &&
      !selectionSubtypes(commandContext).has('redact') &&
      new Set(
        (anno(commandContext)?.listSelected() ?? []).map(
          (annotation) => annotation.ref.page.pageObjectNumber,
        ),
      ).size === 1,
    enabled: (commandContext) =>
      commandContext.tryGet(DocumentsToken)?.allows('doc.download') ?? true,
  },
  {
    id: 'annotation:group',
    labelKey: 'commands.annotate.group',
    icon: 'group',
    categories: ['annotation'],
    run: (commandContext) => void anno(commandContext)?.group(),
    visible: (commandContext) => anno(commandContext)?.canGroup() ?? false,
  },
  {
    id: 'annotation:ungroup',
    labelKey: 'commands.annotate.ungroup',
    icon: 'ungroup',
    categories: ['annotation'],
    run: (commandContext) => void anno(commandContext)?.ungroup(),
    visible: (commandContext) => anno(commandContext)?.canUngroup() ?? false,
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
    visible: (commandContext) => {
      const selection = textSelection(commandContext);
      return !!selection && selection.hasSelection() && selection.canCopy();
    },
    // Async Clipboard write inside the click's activation window; instant
    // when <SelectionClipboard>'s commit prefetch already fetched the text.
    // A successful copy consumes the selection, which also dismisses its strip.
    run: (commandContext) => {
      const selection = textSelection(commandContext);
      if (!selection) return;
      const copiedRange = selection.getRange();
      void copySelection(selection).then(
        (text) => {
          // Clipboard writes can outlive the click. Never let an older copy
          // completion clear a newer selection the user made in the meantime.
          if (text !== '' && sameTextRange(selection.getRange(), copiedRange)) selection.clear();
        },
        () => {}, // Copy failed: preserve the selection so the user can retry.
      );
    },
  },

  // ── link strip items: Link / Go to link / Remove link ────────────────────
  {
    // Make the selection a link: opens the anchored popover (a link is a
    // verb on the selection, not a style), whose editor sets
    // the target through `updateSelection({ link })`; the plugin's
    // reconciler materializes the attached child annotations.
    id: 'annotation:link',
    labelKey: 'commands.annotate.link',
    icon: 'link',
    categories: ['annotation'],
    run: (commandContext) => commandContext.tryGet(ShellToken)?.toggle('link-editor'),
    active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen('link-editor') ?? false,
    visible: (commandContext) => selectionLink(commandContext) === null,
  },
  {
    id: 'annotation:goto-link',
    labelKey: 'commands.annotate.gotoLink',
    icon: 'externalLink',
    categories: ['annotation'],
    run: (commandContext) => {
      const target = selectionLink(commandContext);
      const link = commandContext.tryGet(LinkToken);
      // The opener performs the uri outcome (window.open) — bare `activate`
      // resolves but opens nothing for URL targets.
      if (target && link) openLinkTarget(link, target);
    },
    visible: (commandContext) => selectionLink(commandContext) != null,
  },
  {
    id: 'annotation:remove-link',
    labelKey: 'commands.annotate.removeLink',
    icon: 'linkOff',
    categories: ['annotation'],
    run: (commandContext) => anno(commandContext)?.updateSelection({ link: null }),
    visible: (commandContext) => selectionLink(commandContext) != null,
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
  'mode:measure',
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
    // A mode tab is a shell surface and a tool policy: the Form tab flips the
    // pointer into form design ('form-edit' — widgets select/move/resize like
    // annotations); every other tab (and closing one) drops back to the
    // default pointer, where widgets are fill controls again.
    run: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      shell?.toggle(id, { exclusive: 'mode' });
      interaction(commandContext)?.activateTool(shell?.isOpen(id) ? toolId : 'pointer');
    },
    active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen(id) ?? false,
  };
}
