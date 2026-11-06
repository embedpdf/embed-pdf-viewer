/**
 * The panels a layout brings, as commands. Every panel gets `panel:<id>`, which
 * opens and closes it, labeled and drawn as the layout's panel says (its
 * `title` or `titleKey`, its `icon`); a panel that can't close (`closable:
 * false`) gets one that only opens it. The command's label is the panel's
 * title in its header too, so one string (`panel:<id>`) or one `title` renames
 * both. Which side a panel is on is the layout's too; the panels on one side
 * take turns where they're drawn (ui/panels.tsx).
 * The built-in panels bring their own title and icon, whatever layout names
 * them, and what their commands need: the feature that turns them off,
 * whether the session may use them (the owning plugin's `can*` check), when
 * there is something to show, and whether opening one puts the cursor in it.
 * Search also brings Find (`search:find`, Ctrl/Cmd+F), which opens it with the
 * cursor in its field and never closes it.
 */
import { panelCommandOf, type LayoutData, type LayoutPanel } from '@embedpdf/core-ui';
import { AnnotationToken } from '@embedpdf/react/annotation';
import { AttachmentToken } from '@embedpdf/react/attachment';
import { CommandsToken, type CommandDefinition } from '@embedpdf/react/commands';
import { FormToken } from '@embedpdf/react/form';
import { MeasurementToken } from '@embedpdf/react/measurement';
import { OutlineToken } from '@embedpdf/react/outline';
import { RedactionToken } from '@embedpdf/react/redaction';
import { RenderToken } from '@embedpdf/react/render';
import { SearchToken } from '@embedpdf/react/search';
import { ShellToken } from '@embedpdf/react/shell';
import { SignatureToken } from '@embedpdf/react/signature';
import { StampToken } from '@embedpdf/react/stamp';

import type { Feature } from '../features';
import type { PanelSide } from '../ui/panel-layout';

type Panels = NonNullable<LayoutData['panels']>;

const isPanel = (value: unknown): value is LayoutPanel =>
  typeof value === 'object' && value !== null;

/** The side a panel opens on: `end` unless it says `start`. */
export const panelSideOf = (panel: LayoutPanel): PanelSide =>
  panel.side === 'start' ? 'start' : 'end';

/** The ids of the layout's panels on `side`, in layout order. */
export function panelsOnSide(data: LayoutData, side: PanelSide): string[] {
  return Object.entries(data.panels ?? {})
    .filter(([, panel]) => isPanel(panel) && panelSideOf(panel) === side)
    .map(([id]) => id);
}

/** One side of the pages as it stands: the layout's panels there, which show, and the one drawn. */
export interface SidePanels {
  /** The layout's panels on the side, in layout order. */
  readonly ids: readonly string[];
  /** Those whose buttons show. */
  readonly shown: readonly string[];
  /** The panel drawn on the side, or `null` with none open. */
  readonly current: string | null;
  /** Whether a panel docks now, at the viewer's size. */
  readonly docks: (id: string) => boolean;
}

/** What a side opens by itself ({@link panelOpeningOnSide}). */
export interface SideOpening {
  /** The panel to open, or `null`. */
  readonly open: string | null;
  /** The panels opening from the start that had their turn now, opened or not. */
  readonly started: readonly string[];
}

/**
 * What a side opens by itself, on a side with nothing open: the first panel, in layout order,
 * that docks now and either can't close (`closable: false`: it's always open where it docks) or
 * opens from the start (`open: true`) and hasn't had its turn in this document (`started`). A
 * panel opening from the start has its turn the first time it shows, so one whose button waits
 * for its list still opens once it has one; on a side already open, or where it doesn't dock,
 * its turn passes and it stays closed.
 */
export function panelOpeningOnSide(
  panels: Panels,
  side: SidePanels,
  started: ReadonlySet<string>,
): SideOpening {
  const shown = side.ids.filter((id) => side.shown.includes(id) && isPanel(panels[id]));
  const turns = shown.filter((id) => panels[id]!.open === true && !started.has(id));
  if (side.current !== null) return { open: null, started: turns };
  const open =
    shown.find((id) => side.docks(id) && (panels[id]!.closable === false || turns.includes(id))) ??
    null;
  return { open, started: turns };
}

/** What a built-in panel brings to the layout's panel: its words, icon and command's needs. */
type BuiltInPanel = Pick<CommandDefinition, 'allowed' | 'notAllowedKey' | 'visible'> & {
  /** Its title's key, in its header and on its button, unless the layout gives its own title. */
  readonly titleKey: string;
  /** Its button's icon, unless the layout gives one. */
  readonly icon: string;
  readonly categories: readonly Feature[];
  /** Opening it asks for the cursor (`open(id, { focus: true })`), for a panel you type in. */
  readonly focus?: boolean;
};

/**
 * Whether a list panel has a job: its list holds entries, or the session may add some (the
 * right, and `adding`, the feature that turns adding off, on). A document without an outline
 * shows no outline button to a session that can't add items; the same for attachments.
 */
const hasJob = (
  commandContext: Parameters<NonNullable<CommandDefinition['visible']>>[0],
  entries: number,
  mayAdd: boolean,
  adding: Feature,
): boolean =>
  entries > 0 ||
  (mayAdd && !(commandContext.tryGet(CommandsToken)?.isCategoryDisabled(adding) ?? false));

/** The search panel's id in the layout. */
const SEARCH_PANEL = 'search';

/** Searching, which the search panel and Find need: without it every query is refused. */
const SEARCHES: Pick<CommandDefinition, 'allowed' | 'notAllowedKey'> & {
  readonly categories: readonly Feature[];
} = {
  categories: ['search'],
  allowed: (commandContext) => commandContext.tryGet(SearchToken)?.canSearch() ?? true,
  notAllowedKey: 'commands.notAllowed.doc-text-search',
};

/**
 * Find: the search panel with the cursor in its field, its text selected so typing replaces it.
 * It opens search, or keeps it open, and never closes it, and Ctrl/Cmd+F runs it from a text
 * field in the viewer too (the search field itself among them).
 */
const FIND_COMMAND: CommandDefinition = {
  id: 'search:find',
  labelKey: 'commands.find',
  icon: 'search',
  shortcut: 'Mod+F',
  shortcutInTextFields: true,
  ...SEARCHES,
  run: (commandContext) => commandContext.tryGet(ShellToken)?.open(SEARCH_PANEL, { focus: true }),
};

const BUILT_IN_PANELS: ReadonlyMap<string, BuiltInPanel> = new Map<string, BuiltInPanel>([
  // A thumbnail is a picture of the page with a right of its own (`doc.render.thumbnail`, which
  // `doc.render` includes): without it there is nothing the panel could show.
  [
    'thumbnails',
    {
      titleKey: 'panels.thumbnails',
      icon: 'sidebar',
      categories: ['thumbnails'],
      allowed: (commandContext) => commandContext.tryGet(RenderToken)?.canRenderThumbnail() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-render-thumbnail',
    },
  ],
  // The outline and attachments panels show while they have a job (`hasJob`): their lists are
  // read once a document shows (ui/sidebar-reads.tsx), so their buttons know.
  [
    'outline',
    {
      titleKey: 'panels.outline',
      icon: 'listTree',
      categories: ['outline'],
      visible: (commandContext) => {
        const outline = commandContext.tryGet(OutlineToken);
        return (
          outline != null &&
          hasJob(commandContext, outline.list().length, outline.canEdit(), 'outline.editing')
        );
      },
    },
  ],
  [
    'attachments',
    {
      titleKey: 'panels.attachments',
      icon: 'paperclip',
      categories: ['attachments'],
      visible: (commandContext) => {
        const attachment = commandContext.tryGet(AttachmentToken);
        return (
          attachment != null &&
          hasJob(
            commandContext,
            attachment.list().length,
            attachment.canCreate(),
            'attachments.adding',
          )
        );
      },
    },
  ],
  // Without searching the panel has no job; its button puts the cursor in the field, as Find does.
  [SEARCH_PANEL, { titleKey: 'panels.search', icon: 'search', ...SEARCHES, focus: true }],
  // Without it there is nothing this panel could show.
  [
    'comments',
    {
      titleKey: 'panels.comments',
      icon: 'comment',
      categories: ['comments'],
      allowed: (commandContext) => commandContext.tryGet(AnnotationToken)?.canRead() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-annotate-read',
    },
  ],
  ['style', { titleKey: 'panels.style', icon: 'palette', categories: ['annotations'] }],
  // The stamp libraries are the stamp plugin's: without it there is nothing to pick.
  [
    'stamps',
    {
      titleKey: 'panels.stamps',
      icon: 'rubberStamp',
      categories: ['stamps'],
      allowed: (commandContext) =>
        commandContext.tryGet(StampToken)?.canPlace(commandContext.documentId ?? undefined) ?? true,
      notAllowedKey: 'commands.notAllowed.annotations-create',
      visible: (commandContext) => commandContext.tryGet(StampToken) != null,
    },
  ],
  // A person's marks are stamp libraries; the document's signatures are the signature plugin's.
  [
    'signatures',
    {
      titleKey: 'panels.signatures',
      icon: 'signature',
      categories: ['signatures'],
      visible: (commandContext) =>
        commandContext.tryGet(StampToken) != null && commandContext.tryGet(SignatureToken) != null,
    },
  ],
  // Useful to a session that can propose marks or apply them; with neither power the panel
  // could only show other people's pending marks.
  [
    'redaction',
    {
      titleKey: 'panels.redaction',
      icon: 'redactionSidebar',
      categories: ['redaction'],
      allowed: (commandContext) => {
        const redaction = commandContext.tryGet(RedactionToken);
        return redaction ? redaction.canMark() || redaction.canApply() : true;
      },
    },
  ],
  // Useful to a session that can draw measurements or set a page's scale; with neither power the
  // panel (and the Measure bar's scale button, which opens it) could only read the scale back.
  [
    'measurement',
    {
      titleKey: 'panels.measurement',
      icon: 'updateScale',
      categories: ['measurement'],
      allowed: (commandContext) => {
        const measurement = commandContext.tryGet(MeasurementToken);
        const annotation = commandContext.tryGet(AnnotationToken);
        return measurement ? measurement.canCalibrate() || (annotation?.canCreate() ?? true) : true;
      },
    },
  ],
  // The form designer's sidebar: for a session that may design forms, and in Form mode only,
  // so it closes as Form mode does (`form:design` is its switch).
  [
    'form-design',
    {
      titleKey: 'panels.formDesign',
      icon: 'formDesign',
      categories: ['forms.building'],
      allowed: (commandContext) => commandContext.tryGet(FormToken)?.canDesign() ?? true,
      visible: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen('mode:form') ?? false,
    },
  ],
]);

/**
 * How a panel's button opens it: it opens the panel and closes it again; for a panel that can't
 * close, it opens it and leaves it open, pressed while it's open.
 */
const openingOf = (
  id: string,
  focus: boolean | undefined,
  closable: boolean,
): Pick<CommandDefinition, 'panel' | 'run' | 'active'> =>
  closable
    ? { panel: focus ? { id, focus } : id }
    : {
        run: (commandContext) =>
          commandContext.tryGet(ShellToken)?.open(id, focus ? { focus } : undefined),
        active: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen(id) ?? false,
      };

/**
 * A `panel:<id>` command for each of the layout's panels that has none yet (`isTaken` says which
 * ids do): it opens the panel, or closes it when it's open, unless the panel can't close. Its
 * label is the layout's title, else a built-in panel's own; without either, the panel's id. Its
 * icon is the layout's, else a built-in panel's. A search panel brings Find too.
 */
export function panelCommandsFor(
  panels: LayoutData['panels'],
  isTaken: (id: string) => boolean,
): CommandDefinition[] {
  return Object.entries(panels ?? {}).flatMap(([id, panel]): CommandDefinition[] => {
    const commandId = panelCommandOf(id);
    if (!isPanel(panel)) return [];
    const find = id === SEARCH_PANEL && !isTaken(FIND_COMMAND.id) ? [FIND_COMMAND] : [];
    if (isTaken(commandId)) return find;
    const builtIn = BUILT_IN_PANELS.get(id);
    const { focus, titleKey: _titleKey, icon: _icon, ...facts } = builtIn ?? {};
    const titleKey = panel.titleKey ?? (panel.title === undefined ? builtIn?.titleKey : undefined);
    return [
      {
        id: commandId,
        label: panel.title ?? (titleKey === undefined ? id : undefined),
        labelKey: titleKey,
        icon: panel.icon ?? builtIn?.icon,
        ...openingOf(id, focus, panel.closable !== false),
        ...facts,
      },
      ...find,
    ];
  });
}

/** Whether two layouts' panels are the same, field for field. */
export const samePanels = (left: Panels | undefined, right: Panels | undefined): boolean =>
  left === right || JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
