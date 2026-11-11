/**
 * The command vocabulary — the semantic layer. Every command is a pure value:
 * label key, icon, shortcut, derivations, and a `run` (or a declarative
 * surface target). Commands reach plugins through a typed
 * `commandContext.tryGet(Token)`, never by string id and cast.
 *
 * Each command names its most specific feature in `categories` (the tree in
 * `../features.ts`), so `disable` and `readOnly` turn it off, and whether the
 * session may run it in `allowed`, from the owning plugin's `can*` check
 * (docs/conventions/permissions.md), so a user who may not doesn't see it.
 * `enabled` is only for what can't run right now.
 *
 * Wiring:
 *   zoom/pan/pointer/spread/scroll/rotate  → real Stage / Interaction / PageEdit
 *   modes                                  → shell exclusive surfaces ('mode')
 *   panels                                 → the layout's `panel:<id>` (panels.ts)
 *   full screen                            → the layout root's `view:fullscreen`
 *                                            (fullscreen.ts)
 *   menus / modals                         → declarative shell targets
 *   annotate + shape tools                 → real interaction tools
 *   form tools                             → real form plugin palette (draw-to-place)
 *   insert tools                           → real stamp and signature panels +
 *                                            image/attachment click-then-pick
 *   history undo/redo                      → real History
 */
import { panelCommandOf } from '@embedpdf/core-ui';
import type { AnnotationRef, AnnotationToolInput } from '@embedpdf/react/annotation';
import {
  CommandsToken,
  standardCommands,
  type CommandDefinition,
  type IconAccent,
} from '@embedpdf/react/commands';
import { FormToken } from '@embedpdf/react/form';
import { HistoryToken } from '@embedpdf/react/history';
import { DocumentsToken } from '@embedpdf/react/runtime';
import { StageToken, ZoomMode } from '@embedpdf/react/stage';
import type { LayoutKind, SpreadMode } from '@embedpdf/react/stage';
import { InteractionToken } from '@embedpdf/react/interaction';
import { ShellToken } from '@embedpdf/react/shell';
import { AnnotationToken } from '@embedpdf/react/annotation';
import { copySelection, SelectionToken, type TextRange } from '@embedpdf/react/selection';
import { LinkToken, type PdfLinkTarget } from '@embedpdf/react/link';
import { MeasurementToken } from '@embedpdf/react/measurement';
import { RedactionToken } from '@embedpdf/react/redaction';
import { StampToken } from '@embedpdf/react/stamp';
import { SignatureToken } from '@embedpdf/react/signature';
import { I18nToken } from '@embedpdf/react/i18n';
import { RenderToken, SNAPSHOT_TOOL } from '@embedpdf/react/render';
import type { PageRef } from '@embedpdf/react/runtime';
import { copyImage, saveFile } from '@embedpdf/web';

import type { Feature } from '../features';
import { attachmentCommands } from './attachments';
import { commentCommands } from './comments';
import { openModeSurfaceOf } from './modes';
import { openFileCommand } from './open-files';
import { outlineCommands } from './outline';
import { pageCommands } from './page-commands';

// ── helpers ────────────────────────────────────────────────────────────────
type Ctx = Parameters<NonNullable<CommandDefinition['run']>>[0];

/** The dialog the Go to Page command opens without a page to go to (ui/go-to-page.tsx). */
export const GO_TO_PAGE_DIALOG = 'go-to-page';
/** The keyboard shortcuts sheet, which `?` opens (ui/shortcuts-sheet.tsx). */
export const SHORTCUTS_DIALOG = 'shortcuts';
/** The confirmation before marked areas are removed for good (ui/redact-confirm.tsx). */
export const REDACT_CONFIRM_DIALOG = 'redact-confirm';
/** The Print dialog: which pages, and whether annotations print (ui/print-dialog.tsx). */
export const PRINT_DIALOG = 'print';
/** The form designer's sidebar (ui/form-design-panel.tsx), which `form:design` opens. */
export const FORM_DESIGN_PANEL = 'form-design';
/** Form design's resting tool, the form plugin's: widgets select, move and resize there. */
export const FORM_DESIGN_TOOL = 'form-edit';
/** The form plugin's field tools, each placing a field (the Form bar's `tool:*` buttons). */
const FORM_FIELD_TOOLS: readonly string[] = [
  'form-text',
  'form-checkbox',
  'form-radio',
  'form-combobox',
  'form-listbox',
  'form-button',
  'form-signature',
];

/**
 * Whether a tool designs a form: design's resting tool, or a field tool. Neither fills, so the
 * form lends its widgets to be selected, moved and resized.
 */
export const isFormDesignTool = (tool: string | null | undefined): boolean =>
  tool === FORM_DESIGN_TOOL || (tool != null && FORM_FIELD_TOOLS.includes(tool));

/** Whether a form is being designed: the active tool designs it. */
export const isDesigningForm = (commandContext: Pick<Ctx, 'tryGet'>): boolean =>
  isFormDesignTool(commandContext.tryGet(InteractionToken)?.getActiveToolId());

/** Where selection-made stamps go: the user's own library, persisted. */
const CUSTOM_LIBRARY_ID = 'embedpdf-custom';

const stage = (commandContext: Ctx) => commandContext.tryGet(StageToken);
/** Whether the document has more than one page: the commands that step between pages show then. */
const manyPages = (commandContext: Ctx) => (stage(commandContext)?.getPageCount() ?? 0) > 1;
const interaction = (commandContext: Ctx) => commandContext.tryGet(InteractionToken);
const anno = (commandContext: Ctx) => commandContext.tryGet(AnnotationToken);
const textSelection = (commandContext: Ctx) => commandContext.tryGet(SelectionToken);
const renderOf = (commandContext: Ctx) => commandContext.tryGet(RenderToken);
/** The snapshot the snapshot tool holds: the snapshot strip's verbs show while there is one. */
const snapshotOf = (commandContext: Ctx) => renderOf(commandContext)?.getSnapshot() ?? null;

/** The standard download: the document with every change, saved under the document's name. */
const standardDownload = standardCommands.find(
  (command): command is CommandDefinition => 'id' in command && command.id === 'document:download',
)!;

/** A snapshot's file name: the document's name and the page's number, as a PNG (`Report p3.png`). */
const snapshotFileName = (commandContext: Ctx, page: PageRef): string => {
  const documents = commandContext.tryGet(DocumentsToken);
  const id = commandContext.documentId ?? undefined;
  const name = (documents?.get(id)?.name ?? 'document').replace(/\.pdf$/i, '');
  const index =
    documents?.listPages(id).findIndex((info) => info.ref.objectNumber === page.objectNumber) ?? -1;
  return `${name} p${index + 1}.png`;
};

/**
 * Whether the session may run a command, as the plugin that owns its verb says, and the
 * sentence for when it may not (docs/conventions/permissions.md). Without the plugin there is
 * nothing to ask, and the command's own `enabled` or `visible` says it can't run.
 */
type Check = Pick<CommandDefinition, 'allowed' | 'notAllowedKey'>;

/** Drawing an annotation of any kind: `annotation.canCreate()`. */
const CREATES_ANNOTATIONS: Check = {
  allowed: (commandContext) => anno(commandContext)?.canCreate() ?? true,
  notAllowedKey: 'commands.notAllowed.annotations-create',
};
/** Placing and changing form fields: `form.canDesign()`. */
const DESIGNS_FORMS: Check = {
  allowed: (commandContext) => commandContext.tryGet(FormToken)?.canDesign() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-forms-modify',
};
/** Placing a stamp or a signature mark: `stamp.canPlace()`. */
const PLACES_STAMPS: Check = {
  allowed: (commandContext) =>
    commandContext.tryGet(StampToken)?.canPlace(commandContext.documentId ?? undefined) ?? true,
  notAllowedKey: 'commands.notAllowed.annotations-create',
};
const sameTextRange = (left: TextRange | null, right: TextRange | null): boolean =>
  left === right ||
  (!!left &&
    !!right &&
    left.start.page.objectNumber === right.start.page.objectNumber &&
    left.start.index === right.start.index &&
    left.end.page.objectNumber === right.end.page.objectNumber &&
    left.end.index === right.end.index);

/**
 * What a command needs to open and close the layout's panel `id`: it runs the panel's own
 * `panel:<id>` command (config/panels.ts), so it opens only what that one may, shows only while
 * the layout has the panel and `visible` says so, and is active while the panel is open.
 */
const togglesPanel = (id: string, visible?: (commandContext: Ctx) => boolean) => ({
  run: (commandContext: Ctx) =>
    commandContext.tryGet(CommandsToken)?.execute(panelCommandOf(id), {
      documentId: commandContext.documentId ?? undefined,
    }),
  active: (commandContext: Ctx) => commandContext.tryGet(ShellToken)?.isOpen(id) ?? false,
  visible: (commandContext: Ctx) =>
    (commandContext.tryGet(CommandsToken)?.hasCommand(panelCommandOf(id)) ?? false) &&
    (visible?.(commandContext) ?? true),
});

/** A measuring tool can run on the current page: it has a scale (`measurement.canMeasure`). */
const canMeasureNow = (commandContext: Ctx): boolean => {
  const page = stage(commandContext)?.getCurrentPage();
  return page != null && (commandContext.tryGet(MeasurementToken)?.canMeasure(page) ?? false);
};

// ── annotation-selection predicates (drive the floating strip's contents) ────
const hasAnnotationSelection = (commandContext: Ctx) =>
  (anno(commandContext)?.selection.getSelected().length ?? 0) > 0;
/** Whether people may change every selected annotation by hand (no turned-off feature froze it). */
const selectionEditable = (commandContext: Ctx): boolean => {
  const annotation = anno(commandContext);
  return (annotation?.selection.getSelected() ?? []).every(({ ref }) =>
    annotation!.isEditable(ref),
  );
};
/** Strip items gate per subtype (comment hidden on links/widgets) through
 *  one derivation over the selected DTOs, not per-command lookups. */
const selectionSubtypes = (commandContext: Ctx) =>
  new Set(
    (anno(commandContext)?.selection.getSelected() ?? []).map((annotation) => annotation.subtype),
  );
/**
 * The selected redaction marks, when every selected annotation is one; none for a mixed
 * selection, so the annotation bar's Apply never stands for part of what's selected.
 */
const selectedMarks = (commandContext: Ctx): readonly AnnotationRef[] => {
  const selected = anno(commandContext)?.selection.getSelected() ?? [];
  return selected.every((annotation) => annotation.subtype === 'redact')
    ? selected.map((annotation) => annotation.ref)
    : [];
};
/**
 * The selection's `link` value: a target, `null` (linkable but none set), or
 * `undefined` when the selection cannot carry a link at all (widgets, mixed
 * link states) — the schema decides, never a subtype blocklist.
 */
/** The selection's link target, as the annotation holds it (destinations in the file's coordinates). */
const selectionLink = (commandContext: Ctx): PdfLinkTarget | null | undefined => {
  const props = anno(commandContext)?.selection.getProperties();
  if (
    !props ||
    !props.properties.some((property) => property.key === 'link') ||
    props.mixed.includes('link')
  )
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
  const defaults = anno.tools.getDefaults(toolId);
  const colorOf = (key: ColorKey) => (defaults[key] as string | null | undefined) ?? undefined;
  return {
    primary: colorOf(accent.primary),
    secondary: accent.secondary ? colorOf(accent.secondary) : undefined,
  };
};

/** toolId → the feature its command belongs to, for the tools of yours that extend it. */
const TOOL_FEATURES: Record<string, Feature> = {};

/** What a tool command belongs to and needs, and how its icon previews the tool. */
interface ToolOptions {
  /** Its feature, so `disable` and `readOnly` turn it off. */
  readonly feature: Feature;
  /**
   * Whether the session may use it: an authoring tool is gone without it, so a
   * button never offers a paint the owning plugin's gesture gate refuses.
   */
  readonly check?: Check;
  readonly accent?: ToolAccentDefinition;
}

/** A tool command without its label: activates a real interaction tool; active = it's the tool.
 *  The icon previews the tool's current defaults — keyed by the same toolId
 *  as run/active, so the accent can't drift to another tool's colors. */
const toolCommand = (
  id: string,
  toolId: string,
  icon: string | undefined,
  { feature, check, accent }: ToolOptions,
): Omit<CommandDefinition, 'labelKey'> => {
  if (icon) TOOL_ICONS[toolId] = { icon, ...(accent ? { accent } : {}) };
  TOOL_FEATURES[toolId] = feature;
  return {
    id,
    ...(icon ? { icon } : {}),
    categories: [feature],
    ...check,
    run: (commandContext) => interaction(commandContext)?.activateTool(toolId),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === toolId,
    enabled: (commandContext) => interaction(commandContext) != null,
    iconAccent: (commandContext) => toolAccent(commandContext, toolId, accent),
  };
};

const tool = (
  id: string,
  toolId: string,
  labelKey: string,
  icon: string,
  options: ToolOptions,
): CommandDefinition => ({ ...toolCommand(id, toolId, icon, options), labelKey });

/**
 * Selected text made into a highlight, an underline or a strikeout, with the colors of the
 * tool that makes the same: shown only while there's a selection.
 */
const markupSelection = (
  id: string,
  toolId: string,
  labelKey: string,
  icon: string,
  feature: Feature,
): CommandDefinition => ({
  id,
  labelKey,
  icon,
  categories: [feature],
  ...CREATES_ANNOTATIONS,
  visible: (commandContext) => textSelection(commandContext)?.hasSelection() ?? false,
  run: (commandContext) => anno(commandContext)?.createFromSelection(toolId),
  iconAccent: (commandContext) => toolAccent(commandContext, toolId, { primary: 'color' }),
});

/** The page number `page:go-to` was given (`args: { page }`, counted from 1), or `null`. */
const pageArgOf = (args: unknown): number | null => {
  const page = (args as { page?: unknown } | undefined)?.page;
  return typeof page === 'number' && Number.isFinite(page) ? Math.round(page) : null;
};

/** A fixed zoom level (fraction), e.g. 1 = 100%. */
const zoomLevel = (id: string, level: number, label: string): CommandDefinition => ({
  id,
  labelKey: label,
  run: (commandContext) => stage(commandContext)?.zoomTo({ level }),
  enabled: (commandContext) => stage(commandContext) != null,
});

const spread = (
  id: string,
  mode: SpreadMode,
  labelKey: string,
  icon: string,
): CommandDefinition => ({
  id,
  labelKey,
  icon,
  run: (commandContext) => stage(commandContext)?.updateSettings({ spread: mode }),
  active: (commandContext) => stage(commandContext)?.getSettings().spread === mode,
  enabled: (commandContext) => stage(commandContext) != null,
  locked: (commandContext) => stage(commandContext)?.getLock('spread') ?? null,
});

const scroll = (
  id: string,
  layout: Exclude<LayoutKind, 'grid'>,
  labelKey: string,
  icon: string,
): CommandDefinition => ({
  id,
  labelKey,
  icon,
  run: (commandContext) => stage(commandContext)?.updateSettings({ flow: 'continuous', layout }),
  active: (commandContext) => {
    const settings = stage(commandContext)?.getSettings();
    return settings?.flow === 'continuous' && settings.layout === layout;
  },
  enabled: (commandContext) => stage(commandContext) != null,
  locked: (commandContext) =>
    stage(commandContext)?.getLock('flow') ?? stage(commandContext)?.getLock('layout') ?? null,
});

export const defaultCommands: CommandDefinition[] = [
  // ── zoom ───────────────────────────────────────────────────────────────
  {
    id: 'zoom:in',
    labelKey: 'commands.zoom.in',
    icon: 'zoomIn',
    shortcut: ['Mod+=', 'Mod+NumpadAdd'],
    run: (commandContext) => stage(commandContext)?.zoomIn(),
    enabled: (commandContext) => stage(commandContext)?.canZoomIn() ?? false,
  },
  {
    id: 'zoom:out',
    labelKey: 'commands.zoom.out',
    icon: 'zoomOut',
    shortcut: ['Mod+-', 'Mod+NumpadSubtract'],
    run: (commandContext) => stage(commandContext)?.zoomOut(),
    enabled: (commandContext) => stage(commandContext)?.canZoomOut() ?? false,
  },
  {
    id: 'zoom:fit-page',
    labelKey: 'commands.zoom.fitPage',
    icon: 'fitToPage',
    shortcut: 'Mod+0',
    run: (commandContext) => stage(commandContext)?.fitPage(),
    active: (commandContext) => stage(commandContext)?.getZoomMode() === ZoomMode.FitPage,
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:fit-width',
    labelKey: 'commands.zoom.fitWidth',
    icon: 'fitToWidth',
    shortcut: 'Mod+1',
    run: (commandContext) => stage(commandContext)?.fitWidth(),
    active: (commandContext) => stage(commandContext)?.getZoomMode() === ZoomMode.FitWidth,
    enabled: (commandContext) => stage(commandContext) != null,
  },
  {
    id: 'zoom:automatic',
    labelKey: 'commands.zoom.automatic',
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
    id: 'menu:zoom',
    labelKey: 'commands.zoom.menu',
    icon: 'zoomIn',
    menu: 'zoom',
  },

  // ── pages ──────────────────────────────────────────────────────────────
  {
    id: 'page:next',
    labelKey: 'commands.page.next',
    icon: 'chevronRight',
    shortcut: 'ArrowRight',
    run: (commandContext) => stage(commandContext)?.nextPage(),
    enabled: (commandContext) => stage(commandContext)?.canGoNext() ?? false,
    visible: manyPages,
  },
  {
    id: 'page:previous',
    labelKey: 'commands.page.previous',
    icon: 'chevronLeft',
    shortcut: 'ArrowLeft',
    run: (commandContext) => stage(commandContext)?.previousPage(),
    enabled: (commandContext) => stage(commandContext)?.canGoPrevious() ?? false,
    visible: manyPages,
  },
  {
    id: 'page:first',
    labelKey: 'commands.page.first',
    shortcut: 'Home',
    run: (commandContext) => stage(commandContext)?.goToFirstPage(),
    enabled: (commandContext) => stage(commandContext)?.canGoPrevious() ?? false,
    visible: manyPages,
  },
  {
    id: 'page:last',
    labelKey: 'commands.page.last',
    shortcut: 'End',
    run: (commandContext) => stage(commandContext)?.goToLastPage(),
    enabled: (commandContext) => stage(commandContext)?.canGoNext() ?? false,
    visible: manyPages,
  },
  {
    // `execute('page:go-to', { args: { page: 3 } })` goes to page 3 (people count from 1; past
    // either end is that end); without a page it asks for one in a dialog.
    id: 'page:go-to',
    labelKey: 'commands.page.goTo',
    run: (commandContext) => {
      const view = stage(commandContext);
      if (!view) return;
      const page = pageArgOf(commandContext.args);
      if (page === null) {
        commandContext.tryGet(ShellToken)?.open(GO_TO_PAGE_DIALOG, { exclusive: 'modal' });
        return;
      }
      view.goToPage(Math.min(Math.max(page, 1), view.getPageCount()) - 1);
    },
    enabled: (commandContext) => (stage(commandContext)?.getPageCount() ?? 0) > 0,
  },

  // ── tools ──────────────────────────────────────────────────────────────
  {
    id: 'tool:pan',
    labelKey: 'commands.pan',
    icon: 'hand',
    run: (commandContext) => interaction(commandContext)?.activateTool('pan'),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'pan',
    enabled: (commandContext) => interaction(commandContext) != null,
  },
  {
    id: 'tool:pointer',
    labelKey: 'commands.pointer',
    icon: 'pointer',
    run: (commandContext) => interaction(commandContext)?.activateTool('pointer'),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'pointer',
    enabled: (commandContext) => interaction(commandContext) != null,
  },
  // Drag a box to fill the view with it, or click to zoom in a step (Alt: out).
  {
    id: 'tool:zoom',
    labelKey: 'commands.zoom.marquee',
    icon: 'zoomInArea',
    run: (commandContext) => interaction(commandContext)?.activateTool('zoom'),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'zoom',
    enabled: (commandContext) => interaction(commandContext) != null,
  },
  // Drag a box to take that part of a page as a picture, or click for the whole page. A PDF
  // that forbids copying forbids it, as in Acrobat (`render.canSnapshot()`).
  {
    id: 'tool:snapshot',
    labelKey: 'commands.snapshot.tool',
    icon: 'screenshot',
    categories: ['snapshots'],
    allowed: (commandContext) => renderOf(commandContext)?.canSnapshot() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-content-copy',
    run: (commandContext) => interaction(commandContext)?.activateTool(SNAPSHOT_TOOL),
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === SNAPSHOT_TOOL,
    enabled: (commandContext) => interaction(commandContext)?.hasTool(SNAPSHOT_TOOL) ?? false,
  },

  // The panels' `panel:<id>` commands come from the layout's panels (config/panels.ts).

  // ── menus (declarative) ─────────────────────────────────────────────────
  {
    id: 'menu:document',
    labelKey: 'commands.menu',
    icon: 'menu',
    menu: 'document',
  },
  {
    id: 'menu:view',
    labelKey: 'commands.viewControls',
    icon: 'viewSettings',
    menu: 'view',
  },

  // ── the outline ─────────────────────────────────────────────────────────
  ...outlineCommands,

  // ── the files the document carries ──────────────────────────────────────
  ...attachmentCommands,

  // ── comment threads: their status, deleting one ─────────────────────────
  ...commentCommands,

  // ── the pages: rotate, move, insert, delete, copy out ───────────────────
  ...pageCommands,

  // ── document actions ────────────────────────────────────────────────────
  openFileCommand,
  {
    id: 'document:download',
    labelKey: 'commands.download',
    icon: 'download',
    shortcut: 'Mod+S',
    categories: ['documents.download'],
    allowed: (commandContext) => commandContext.tryGet(DocumentsToken)?.canDownload() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-download',
    // The download runs the document's save actions itself (WillSave → read → DidSave)
    // when the actions plugin is installed, so the WillSave changes are in the bytes.
    run: (commandContext) => {
      if (!commandContext.tryGet(DocumentsToken)) return;
      Promise.resolve(standardDownload.run?.(commandContext)).catch((error: unknown) =>
        console.warn('[embedpdf] download failed', error),
      );
    },
    enabled: (commandContext) => commandContext.documentId != null,
  },
  {
    id: 'document:print',
    labelKey: 'commands.print',
    icon: 'print',
    shortcut: 'Mod+P',
    categories: ['documents.print'],
    allowed: (commandContext) => commandContext.tryGet(DocumentsToken)?.canPrint() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-print',
    // The dialog chooses the pages and prepares them; its Print button opens the browser's.
    modal: PRINT_DIALOG,
    enabled: (commandContext) => commandContext.documentId != null,
  },
  // ── page settings (spread / scroll / rotate) ────────────────────────────
  spread('view:single-page', 'none', 'commands.spread.none', 'singlePage'),
  spread('view:two-pages', 'odd', 'commands.spread.odd', 'doublePage'),
  spread('view:cover-page', 'even', 'commands.spread.even', 'book2'),
  // Scrolling is one choice of how the pages come: down, across, or one at a
  // time. Down and across set `flow` with `layout`; one at a time leaves
  // `layout` alone, as it does nothing in paged flow.
  scroll('view:scroll-vertical', 'vertical', 'commands.scroll.vertical', 'vertical'),
  scroll('view:scroll-horizontal', 'horizontal', 'commands.scroll.horizontal', 'horizontal'),
  {
    id: 'view:scroll-paged',
    labelKey: 'commands.scroll.paged',
    icon: 'pageByPage',
    run: (commandContext) => stage(commandContext)?.updateSettings({ flow: 'paged' }),
    active: (commandContext) => stage(commandContext)?.getSettings().flow === 'paged',
    enabled: (commandContext) => stage(commandContext) != null,
    locked: (commandContext) => stage(commandContext)?.getLock('flow') ?? null,
  },
  // View rotation (Adobe's "Rotate View"): rotates how every page displays in
  // the main stage lens — non-persistent, nothing written to the PDF. The
  // permanent per-page rotation (PageEditToken.rotateBy) belongs in a
  // page-organize surface, not behind the view-settings buttons.
  {
    id: 'view:rotate-clockwise',
    labelKey: 'commands.rotate.clockwise',
    icon: 'rotateClockwise',
    run: (commandContext) => stage(commandContext)?.rotateViewBy(90),
    enabled: (commandContext) => stage(commandContext) != null,
    locked: (commandContext) => stage(commandContext)?.getLock('viewRotation') ?? null,
  },
  {
    id: 'view:rotate-counterclockwise',
    labelKey: 'commands.rotate.counterclockwise',
    icon: 'rotateCounterClockwise',
    run: (commandContext) => stage(commandContext)?.rotateViewBy(-90),
    enabled: (commandContext) => stage(commandContext) != null,
    locked: (commandContext) => stage(commandContext)?.getLock('viewRotation') ?? null,
  },

  // ── modes (shell exclusive surfaces, tag 'mode') ────────────────────────
  {
    id: 'mode:view',
    labelKey: 'commands.mode.view',
    // View = no mode bar. Close the open mode, a built-in one or one a layout's
    // bar brought, and drop to pointer.
    run: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      const open = shell ? openModeSurfaceOf(shell) : null;
      if (open) shell?.close(open);
      interaction(commandContext)?.activateTool('pointer');
    },
    active: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      return shell ? openModeSurfaceOf(shell) === null : true;
    },
  },
  modeCommand('mode:annotate', 'commands.mode.annotate', { feature: 'annotations' }),
  modeCommand('mode:shapes', 'commands.mode.shapes', { feature: 'shapes' }),
  // Stamps, images, attachments and signatures: no one feature holds them all.
  modeCommand('mode:insert', 'commands.mode.insert'),
  // Form mode opens for filling and looking; `form:design` switches design on.
  modeCommand('mode:form', 'commands.mode.form', { feature: 'forms.building' }),
  modeCommand('mode:redact', 'commands.mode.redact', { feature: 'redaction' }),
  modeCommand('mode:measure', 'commands.mode.measure', { feature: 'measurement' }),
  // ── annotate tools (real interaction tools) ─────────────────────────────
  tool('tool:highlight', 'highlight', 'commands.annotate.highlight', 'highlight', {
    feature: 'annotations.highlight',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:strikeout', 'strikeout', 'commands.annotate.strikeout', 'strikethrough', {
    feature: 'annotations.markup',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:underline', 'underline', 'commands.annotate.underline', 'underline', {
    feature: 'annotations.markup',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:squiggly', 'squiggly', 'commands.annotate.squiggly', 'squiggly', {
    feature: 'annotations.markup',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:ink', 'ink', 'commands.annotate.ink', 'pencilMarker', {
    feature: 'annotations.drawing',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:ink-highlight', 'ink-highlight', 'commands.annotate.inkHighlight', 'inkHighlighter', {
    feature: 'annotations.drawing',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:free-text', 'free-text', 'commands.annotate.text', 'freeText', {
    feature: 'annotations.text',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'fontColor' },
  }),
  tool('tool:insert-text', 'insert-text', 'commands.annotate.insertText', 'insertText', {
    feature: 'annotations.text',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:replace-text', 'replace-text', 'commands.annotate.replaceText', 'replaceText', {
    feature: 'annotations.text',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:callout', 'free-text-callout', 'commands.annotate.callout', 'callout', {
    feature: 'annotations.text',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color', secondary: 'interiorColor' },
  }),
  // Sticky note ("comment") — click-to-place; the icon renders from the
  // engine-baked /AP in the tool's current color.
  tool('tool:note', 'note', 'commands.annotate.note', 'message', {
    feature: 'annotations.notes',
    check: CREATES_ANNOTATIONS,
  }),
  // Link — drag an invisible hit rectangle, then set the target in the style
  // panel's Link control (create-then-edit). While active, existing links
  // become editable rects instead of navigating.
  tool('tool:link', 'link', 'commands.annotate.link', 'link', {
    feature: 'annotations.links',
    check: CREATES_ANNOTATIONS,
  }),

  // ── shape tools (real interaction tools) ────────────────────────────────
  tool('tool:square', 'square', 'commands.shapes.rectangle', 'square', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color', secondary: 'interiorColor' },
  }),
  tool('tool:circle', 'circle', 'commands.shapes.circle', 'circle', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color', secondary: 'interiorColor' },
  }),
  tool('tool:line', 'line', 'commands.shapes.line', 'line', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  // The arrow tool is a `line` preset (a line with an arrowhead) — registered by
  // the annotationPlugin `tools` config in viewer.tsx, activated like any other tool.
  tool('tool:arrow', 'arrow', 'commands.shapes.arrow', 'lineArrow', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),
  tool('tool:polygon', 'polygon', 'commands.shapes.polygon', 'polygon', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color', secondary: 'interiorColor' },
  }),
  tool('tool:polyline', 'polyline', 'commands.shapes.polyline', 'zigzag', {
    feature: 'shapes',
    check: CREATES_ANNOTATIONS,
    accent: { primary: 'color' },
  }),

  // ── insert tools (stamp/image/attachment real; signature inert) ─────────
  // Stamps open a library, they are not a file dialog: the panel lists the
  // reusable named assets the stamp plugin holds, and picking one arms the
  // annotation plugin's stamp tool with that asset's bytes (stamps-panel.tsx).
  // Arbitrary image bytes are `tool:image` below — a different gesture,
  // so a different button.
  {
    id: 'tool:stamp',
    labelKey: 'commands.insert.stamp',
    icon: 'rubberStamp',
    categories: ['stamps'],
    // Nothing the picker could place without it, as for every insert tool.
    ...PLACES_STAMPS,
    // No stamp plugin → no library to show.
    ...togglesPanel('stamps', (commandContext) => commandContext.tryGet(StampToken) != null),
  },
  // File attachment — click the spot, pick the file (the attachment provider).
  tool('tool:attachment', 'attachment', 'commands.insert.attachment', 'paperclip', {
    feature: 'attachments.adding',
    check: CREATES_ANNOTATIONS,
  }),
  // Signatures open the people panel (libraries of kind 'signatures'): pick a
  // mark → with a target field it signs (or fills) it, else it arms — a click
  // on a signature field signs, anywhere else drops a stamp (Preview).
  {
    id: 'tool:signature',
    labelKey: 'commands.insert.signature',
    icon: 'signature',
    categories: ['signatures.signing'],
    // A mark off a field is a stamp; one on a field is the field's value.
    ...PLACES_STAMPS,
    ...togglesPanel(
      'signatures',
      (commandContext) =>
        commandContext.tryGet(StampToken) != null && commandContext.tryGet(SignatureToken) != null,
    ),
  },
  // Image — the click-then-pick placement: click the spot, the file dialog
  // opens (narrowed to rasters), the picture lands where you clicked. The
  // tool itself is a `stamp` preset registered in viewer.tsx.
  tool('tool:image', 'image', 'commands.insert.image', 'photo', {
    feature: 'stamps',
    check: CREATES_ANNOTATIONS,
  }),

  // ── form design ─────────────────────────────────────────────────────────
  // The switch: on, the design tool and the design sidebar (fields select, move and resize);
  // off, the pointer, where they fill again. A field tool turns design on by itself, and
  // leaving Form mode ends it (its sidebar shows only in Form mode).
  {
    id: 'form:design',
    labelKey: 'commands.form.design',
    icon: 'formDesign',
    categories: ['forms.building'],
    ...DESIGNS_FORMS,
    run: (commandContext) => {
      const tools = interaction(commandContext);
      const shell = commandContext.tryGet(ShellToken);
      if (!tools) return;
      if (isDesigningForm(commandContext)) {
        tools.activateTool('pointer');
        shell?.close(FORM_DESIGN_PANEL);
        return;
      }
      if (shell && !shell.isOpen('mode:form')) shell.open('mode:form', { exclusive: 'mode' });
      tools.activateTool(FORM_DESIGN_TOOL);
      shell?.open(FORM_DESIGN_PANEL);
    },
    active: isDesigningForm,
    enabled: (commandContext) => interaction(commandContext) != null,
  },

  // ── form tools (the form plugin's draw-to-place palette) ────────────────
  tool('tool:text-field', 'form-text', 'commands.form.textfield', 'formTextfield', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:checkbox', 'form-checkbox', 'commands.form.checkbox', 'formCheckbox', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:radio', 'form-radio', 'commands.form.radio', 'formRadio', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:combo-box', 'form-combobox', 'commands.form.select', 'formSelect', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:list-box', 'form-listbox', 'commands.form.listbox', 'formListbox', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:button', 'form-button', 'commands.form.button', 'formButton', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),
  tool('tool:signature-field', 'form-signature', 'commands.form.signature', 'signature', {
    feature: 'forms.building',
    check: DESIGNS_FORMS,
  }),

  // ── redaction (the toolbar arms the tool; the panel applies every mark and
  // the annotation bar the selected ones, both through the one confirmation) ──
  // Marks are annotations, so marking is `redaction.canMark()`.
  tool('tool:redact', 'redact', 'commands.redact.mark', 'redactArea', {
    feature: 'redaction',
    check: {
      allowed: (commandContext) => commandContext.tryGet(RedactionToken)?.canMark() ?? true,
      notAllowedKey: 'commands.notAllowed.annotations-create',
    },
  }),
  {
    id: 'redaction:apply',
    labelKey: 'commands.redact.applyAll',
    icon: 'redact',
    categories: ['redaction'],
    allowed: (commandContext) => commandContext.tryGet(RedactionToken)?.canApply() ?? true,
    // It can't be undone, so it asks first: the confirmation applies.
    modal: REDACT_CONFIRM_DIALOG,
    enabled: (commandContext) => {
      const redaction = commandContext.tryGet(RedactionToken);
      return !!redaction && redaction.getPendingCount() > 0 && !redaction.isApplying();
    },
  },
  {
    // The annotation bar's Apply: the selected marks only. The same confirmation asks first,
    // given the marks selected at the click, so it applies what the user saw selected.
    id: 'annotation:apply-redaction',
    labelKey: 'commands.redact.apply',
    labelParams: (commandContext) => ({ count: selectedMarks(commandContext).length }),
    icon: 'check',
    categories: ['redaction'],
    allowed: (commandContext) => commandContext.tryGet(RedactionToken)?.canApply() ?? true,
    run: (commandContext) =>
      commandContext.tryGet(ShellToken)?.open(REDACT_CONFIRM_DIALOG, {
        exclusive: 'modal',
        props: { refs: selectedMarks(commandContext) },
      }),
    visible: (commandContext) => selectedMarks(commandContext).length > 0,
    enabled: (commandContext) => {
      const redaction = commandContext.tryGet(RedactionToken);
      return !!redaction && !redaction.isApplying();
    },
  },

  // ── measurement: the tools need a calibrated page right now (`canMeasure`) ──
  {
    ...tool('tool:distance', 'distance', 'measurement.distance', 'distance', {
      feature: 'measurement',
      check: CREATES_ANNOTATIONS,
      accent: { primary: 'color' },
    }),
    enabled: canMeasureNow,
  },
  {
    ...tool('tool:perimeter', 'perimeter', 'measurement.perimeter', 'perimeter', {
      feature: 'measurement',
      check: CREATES_ANNOTATIONS,
      accent: { primary: 'color' },
    }),
    enabled: canMeasureNow,
  },
  {
    ...tool('tool:area', 'area', 'measurement.area', 'area', {
      feature: 'measurement',
      check: CREATES_ANNOTATIONS,
      accent: { primary: 'color' },
    }),
    enabled: canMeasureNow,
  },
  {
    id: 'measurement:calibrate',
    labelKey: 'measurement.calibrate',
    icon: 'calibrate',
    categories: ['measurement'],
    // Setting a page's scale changes the document.
    allowed: (commandContext) => commandContext.tryGet(MeasurementToken)?.canCalibrate() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-annotate-modify',
    enabled: (commandContext) => commandContext.tryGet(MeasurementToken) != null,
    active: (commandContext) => interaction(commandContext)?.getActiveToolId() === 'calibrate',
    run: (commandContext) => commandContext.tryGet(MeasurementToken)?.startCalibration(),
  },

  // ── annotation selection (the floating strip's verbs) ──────────────────
  {
    id: 'annotation:cancel-creation',
    labelKey: 'commands.annotate.cancelCreation',
    // No feature: it only ends a drawing in progress. A command that's turned
    // off keeps its keys, and Escape belongs to whatever else is open.
    shortcut: 'Escape',
    enabled: (commandContext) => anno(commandContext)?.draft.get() != null,
    run: (commandContext) => anno(commandContext)?.draft.cancel(),
  },
  {
    id: 'annotation:delete',
    labelKey: 'commands.annotate.delete',
    icon: 'trash',
    // Backspace is the Delete key of a Mac keyboard.
    shortcut: ['Delete', 'Backspace'],
    categories: ['annotations'],
    // One change for the whole selection: a form widget lent to the annotation
    // plugin is deleted as the form says (its field, when every widget of it goes).
    run: (commandContext) => void anno(commandContext)?.selection.delete(),
    visible: hasAnnotationSelection,
    // Mirrors the engine's own authorization, which is per annotation (whose
    // it is), not the scope's: locked/unauthorized annotations keep the button
    // visible but disabled (the engine still enforces), and so do the ones a
    // turned-off feature froze (`isEditable`).
    enabled: (commandContext) => {
      const annotation = anno(commandContext);
      const selected = annotation?.selection.getSelected() ?? [];
      return (
        selected.length > 0 &&
        selected.every(({ ref }) => annotation!.canDelete(ref) && annotation!.isEditable(ref))
      );
    },
  },
  {
    id: 'annotation:comment',
    labelKey: 'commands.comment',
    icon: 'comment',
    categories: ['comments'],
    // The comments panel, which shows the selected annotation's thread.
    ...togglesPanel(
      'comments',
      (commandContext) =>
        hasAnnotationSelection(commandContext) && !selectionSubtypes(commandContext).has('widget'),
    ),
  },
  {
    id: 'annotation:style',
    labelKey: 'commands.style',
    icon: 'palette',
    categories: ['annotations'],
    // The kind table decides: no declared editable props → no style button.
    ...togglesPanel(
      'style',
      (commandContext) =>
        (anno(commandContext)?.selection.getProperties().properties.length ?? 0) > 0,
    ),
  },
  {
    // The selection becomes a reusable stamp: the engine flattens the
    // selected appearances into one page (vector, positions kept) and the
    // stamp plugin files it under the user's own library — persisted like
    // any library, exportable as a PDF Acrobat reads.
    id: 'annotation:stamp-from-selection',
    labelKey: 'commands.annotate.stampFromSelection',
    icon: 'rubberStampPlus',
    categories: ['stamps'],
    // The stamp carries the annotations' appearances out of the document.
    allowed: (commandContext) =>
      commandContext
        .tryGet(StampToken)
        ?.canCreateFromAnnotations(commandContext.documentId ?? undefined) ?? true,
    notAllowedKey: 'commands.notAllowed.doc-download',
    run: (commandContext) => {
      const annotation = anno(commandContext);
      const stamp = commandContext.tryGet(StampToken);
      const documentId = commandContext.documentId;
      if (!annotation || !stamp || documentId == null) return;
      const dtos = annotation.selection.getSelected();
      const page = dtos[0]?.ref.page;
      if (page === undefined) return;
      const i18n = commandContext.tryGet(I18nToken);
      const label = i18n?.t('demo.stampsCustomLabel') ?? 'Custom stamp';
      const libraryName = i18n?.t('demo.stampsCustomLibrary') ?? 'My stamps';
      const libraryId = CUSTOM_LIBRARY_ID;
      const ensureLibrary = stamp.getLibrary(libraryId)
        ? Promise.resolve(libraryId)
        : stamp
            .createLibrary(libraryName, { id: libraryId, categories: ['custom'] })
            .then(({ library }) => library.id);
      ensureLibrary
        .then((id) =>
          stamp.createAssetFromAnnotations(
            page,
            dtos.map((annotation) => annotation.ref),
            { libraryId: id, label: `${label} ${stamp.listAssets({ libraryId: id }).length + 1}` },
            { documentId },
          ),
        )
        // Open the stamps panel on the custom library, through its own command;
        // the panel reads its surface's props for its picker.
        .then(async () => {
          const shell = commandContext.tryGet(ShellToken);
          if (!shell) return;
          if (!shell.isOpen('stamps')) {
            await commandContext
              .tryGet(CommandsToken)
              ?.execute(panelCommandOf('stamps'), { documentId });
          }
          shell.updateSurfaceProps('stamps', { libraryId });
        })
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
        (anno(commandContext)?.selection.getSelected() ?? []).map(
          (annotation) => annotation.ref.page.objectNumber,
        ),
      ).size === 1,
  },
  {
    // Copies of the selection beside the originals, selected, ready to drag
    // into place: one step to undo.
    id: 'annotation:duplicate',
    labelKey: 'commands.annotate.duplicate',
    icon: 'duplicate',
    shortcut: 'Mod+D',
    categories: ['annotations'],
    // Creating annotations, for the annotations selected. A form field's box
    // needs the form's own right instead, which `canDuplicate()` checks.
    allowed: (commandContext) => {
      const annotation = anno(commandContext);
      const own = (annotation?.selection.getSelected() ?? []).some(
        ({ subtype }) => subtype !== 'widget',
      );
      return own ? (annotation?.canCreate() ?? true) : true;
    },
    notAllowedKey: CREATES_ANNOTATIONS.notAllowedKey,
    // A refusal reaches the user as any failed write does (`onWriteFailed`).
    run: (commandContext) =>
      void anno(commandContext)
        ?.selection.duplicate()
        .catch(() => {}),
    // For what people place and drag, a form field's box among them (the form
    // copies it, in the same step): an annotation that sits on text (a
    // highlight) stays there.
    visible: (commandContext) => {
      const annotation = anno(commandContext);
      const selected = annotation?.selection.getSelected() ?? [];
      return (
        selected.length > 0 &&
        selectionEditable(commandContext) &&
        selected.every(({ ref }) => annotation!.isMovable(ref))
      );
    },
    // A copy of a locked annotation would be locked too: nobody could move
    // or delete it by hand, so the button shows greyed out, as Delete does.
    enabled: (commandContext) => anno(commandContext)?.selection.canDuplicate() ?? false,
  },
  {
    id: 'annotation:group',
    labelKey: 'commands.annotate.group',
    icon: 'group',
    categories: ['annotations'],
    run: (commandContext) => void anno(commandContext)?.selection.group(),
    visible: (commandContext) =>
      (anno(commandContext)?.selection.canGroup() ?? false) && selectionEditable(commandContext),
  },
  {
    id: 'annotation:ungroup',
    labelKey: 'commands.annotate.ungroup',
    icon: 'ungroup',
    categories: ['annotations'],
    run: (commandContext) => void anno(commandContext)?.selection.ungroup(),
    visible: (commandContext) =>
      (anno(commandContext)?.selection.canUngroup() ?? false) && selectionEditable(commandContext),
  },

  // ── text selection (the selection strip's verbs) ────────────────────────
  {
    id: 'selection:copy',
    labelKey: 'commands.selection.copy',
    icon: 'copy',
    categories: ['text.copy'],
    // A deployment denying doc.text.copy shows no Copy at all — and with zero
    // visible commands the strip renders nothing, so there is never an empty
    // bubble. Ctrl/Cmd+C is the clipboard wiring's, which says it isn't allowed.
    allowed: (commandContext) => textSelection(commandContext)?.canCopy() ?? true,
    notAllowedKey: 'commands.notAllowed.doc-text-copy',
    visible: (commandContext) => textSelection(commandContext)?.hasSelection() ?? false,
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

  markupSelection(
    'selection:highlight',
    'highlight',
    'commands.annotate.highlight',
    'highlight',
    'annotations.highlight',
  ),
  markupSelection(
    'selection:underline',
    'underline',
    'commands.annotate.underline',
    'underline',
    'annotations.markup',
  ),
  markupSelection(
    'selection:strikeout',
    'strikeout',
    'commands.annotate.strikeout',
    'strikethrough',
    'annotations.markup',
  ),

  // ── the snapshot (the snapshot strip's verbs) ───────────────────────────
  {
    id: 'snapshot:copy',
    labelKey: 'commands.snapshot.copy',
    icon: 'copy',
    shortcut: 'Mod+C',
    categories: ['snapshots'],
    visible: (commandContext) => snapshotOf(commandContext) != null,
    // Straight to the clipboard, in the click itself: the picture follows when it's there. A
    // copy lets the snapshot go, which also dismisses its strip, as copying text does.
    run: (commandContext) => {
      const render = renderOf(commandContext);
      const snapshot = render?.getSnapshot();
      if (!render || !snapshot) return;
      void copyImage(snapshot.image).then(
        () => {
          // A copy can outlive the click: never let it go of a newer snapshot.
          if (render.getSnapshot() === snapshot) render.clearSnapshot();
        },
        () => {}, // Copy failed: keep the snapshot, to copy again or save.
      );
    },
  },
  {
    id: 'snapshot:save',
    labelKey: 'commands.snapshot.save',
    icon: 'download',
    categories: ['snapshots'],
    visible: (commandContext) => snapshotOf(commandContext) != null,
    run: (commandContext) => {
      const snapshot = snapshotOf(commandContext);
      if (!snapshot) return;
      const name = snapshotFileName(commandContext, snapshot.page);
      snapshot.image
        .then((image) => image.blob())
        .then((blob) => saveFile(blob, name, 'image/png'))
        .catch((error) => console.warn('[snippet-react] snapshot save failed', error));
    },
  },
  {
    id: 'snapshot:clear',
    labelKey: 'commands.snapshot.clear',
    icon: 'x',
    shortcut: 'Escape',
    categories: ['snapshots'],
    visible: (commandContext) => snapshotOf(commandContext) != null,
    run: (commandContext) => renderOf(commandContext)?.clearSnapshot(),
  },

  // ── link strip items: Link / Go to link / Remove link ────────────────────
  {
    // Make the selection a link: opens the anchored popover (a link is a
    // verb on the selection, not a style), whose editor sets
    // the target through `selection.updateLink(target)`; the plugin's
    // reconciler materializes the attached child annotations.
    id: 'annotation:link',
    labelKey: 'commands.annotate.link',
    icon: 'link',
    categories: ['annotations.links'],
    run: (commandContext) => commandContext.tryGet(ShellToken)?.toggle('link-editor'),
    active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen('link-editor') ?? false,
    visible: (commandContext) => selectionLink(commandContext) === null,
  },
  {
    id: 'annotation:goto-link',
    labelKey: 'commands.annotate.gotoLink',
    icon: 'externalLink',
    // No feature: following a link is reading the document.
    run: (commandContext) => {
      const target = selectionLink(commandContext);
      // Following a link opens a website too, through the link layer's opener.
      if (target) commandContext.tryGet(LinkToken)?.activate(target);
    },
    visible: (commandContext) => selectionLink(commandContext) != null,
  },
  {
    id: 'annotation:remove-link',
    labelKey: 'commands.annotate.removeLink',
    icon: 'linkOff',
    categories: ['annotations.links'],
    run: (commandContext) => anno(commandContext)?.selection.updateLink(null),
    visible: (commandContext) => selectionLink(commandContext) != null,
  },

  // ── the keyboard ────────────────────────────────────────────────────────
  {
    // No feature: it only says which keys do what.
    id: 'help:shortcuts',
    labelKey: 'commands.shortcuts',
    shortcut: '?',
    modal: SHORTCUTS_DIALOG,
    enabled: (commandContext) => commandContext.tryGet(ShellToken) != null,
  },

  // ── history ──────────────────────────────────────────────────────────────
  // Focus in a text field keeps its own undo: shortcuts skip text fields.
  {
    id: 'history:undo',
    labelKey: 'commands.undo',
    icon: 'arrowBackUp',
    shortcut: 'Mod+z',
    run: (commandContext) => commandContext.tryGet(HistoryToken)?.undo(),
    enabled: (commandContext) => commandContext.tryGet(HistoryToken)?.canUndo() ?? false,
  },
  {
    id: 'history:redo',
    labelKey: 'commands.redo',
    icon: 'arrowForwardUp',
    shortcut: ['Shift+Mod+z', 'Mod+y'],
    run: (commandContext) => commandContext.tryGet(HistoryToken)?.redo(),
    enabled: (commandContext) => commandContext.tryGet(HistoryToken)?.canRedo() ?? false,
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
  { feature }: { feature?: Feature } = {},
): CommandDefinition {
  return {
    id,
    labelKey,
    // The tab goes with its feature; a tab of several features stays.
    ...(feature ? { categories: [feature] } : {}),
    // A mode tab is a shell surface and a tool policy: every tab (and closing
    // one) drops back to the default pointer, where widgets are fill controls;
    // form design is `form:design`'s switch inside the Form tab.
    run: (commandContext) => {
      const shell = commandContext.tryGet(ShellToken);
      shell?.toggle(id, { exclusive: 'mode' });
      interaction(commandContext)?.activateTool('pointer');
    },
    active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen(id) ?? false,
  };
}

// ── your own tools ───────────────────────────────────────────────────────────

/**
 * A `tool:<id>` command for each tool of yours (`plugins.annotation.tools`) that no command has
 * (`isTaken` says which ids do): labelled by its `meta.label`, else its id; drawn with its
 * `meta.icon`, else the icon of the tool it extends; in that tool's feature, else `annotations`.
 */
export function toolCommandsFor(
  tools: readonly AnnotationToolInput[],
  isTaken: (id: string) => boolean,
): CommandDefinition[] {
  return tools.flatMap((input): CommandDefinition[] => {
    const id = `tool:${input.id}`;
    if (isTaken(id)) return [];
    const base = input.extends;
    const meta = input.meta ?? {};
    const icon = typeof meta.icon === 'string' ? meta.icon : base && TOOL_ICONS[base]?.icon;
    const command = toolCommand(id, input.id, icon || undefined, {
      feature: (base && TOOL_FEATURES[base]) || 'annotations',
      check: CREATES_ANNOTATIONS,
      ...(base && TOOL_ICONS[base]?.accent ? { accent: TOOL_ICONS[base].accent } : {}),
    });
    return [{ ...command, label: typeof meta.label === 'string' ? meta.label : input.id }];
  });
}
