/**
 * The panels a layout brings, as commands. Every panel gets `panel:<id>`, which
 * opens and closes it, labeled and drawn as the layout's panel says (its
 * `title` or `titleKey`, its `icon`). Which side a panel is on is the layout's
 * too; the panels on one side take turns where they're drawn (ui/panels.tsx).
 * The built-in panels add what their commands need: the feature that turns
 * them off, whether the session may use them (the owning plugin's `can*`
 * check), when there is something to show, and whether opening one puts the
 * cursor in it. Search also brings Find (`search:find`, Ctrl/Cmd+F), which
 * opens it with the cursor in its field and never closes it.
 */
import { panelCommandOf, type LayoutData, type LayoutPanel } from '@embedpdf/core-ui';
import { AnnotationToken } from '@embedpdf/react/annotation';
import type { CommandDef } from '@embedpdf/react/commands';
import { FormToken } from '@embedpdf/react/form';
import { OutlineToken } from '@embedpdf/react/outline';
import { RedactionToken } from '@embedpdf/react/redaction';
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

/** What a built-in panel's command adds to the layout's panel. */
type PanelCommandFacts = Pick<CommandDef, 'allowed' | 'notAllowedKey' | 'visible'> & {
  readonly categories: readonly Feature[];
  /** Opening it asks for the cursor (`open(id, { focus: true })`), for a panel you type in. */
  readonly focus?: boolean;
};

/** The search panel's id in the layout. */
const SEARCH_PANEL = 'search';

/** Searching, which the search panel and Find need: without it every query is refused. */
const SEARCHES: Pick<CommandDef, 'allowed' | 'notAllowedKey'> & {
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
const FIND_COMMAND: CommandDef = {
  id: 'search:find',
  labelKey: 'commands.find',
  icon: 'search',
  shortcut: 'Mod+F',
  shortcutInTextFields: true,
  ...SEARCHES,
  run: (commandContext) => commandContext.tryGet(ShellToken)?.open(SEARCH_PANEL, { focus: true }),
};

const BUILT_IN_PANELS: ReadonlyMap<string, PanelCommandFacts> = new Map<string, PanelCommandFacts>([
  ['thumbnails', { categories: ['thumbnails'] }],
  // The outline panel shows whenever the plugin is there, even for a document without one: its
  // button stays put from document to document, and the panel says there is none.
  [
    'outline',
    {
      categories: ['outline'],
      visible: (commandContext) => commandContext.tryGet(OutlineToken) != null,
    },
  ],
  // No plugin lists the document's attached files: the panel has nothing to show, so it never shows.
  ['attachments', { categories: ['attachments'], visible: () => false }],
  // Without searching the panel has no job; its button puts the cursor in the field, as Find does.
  [SEARCH_PANEL, { ...SEARCHES, focus: true }],
  // Without it there is nothing this panel could show.
  [
    'comments',
    {
      categories: ['comments'],
      allowed: (commandContext) => commandContext.tryGet(AnnotationToken)?.canRead() ?? true,
      notAllowedKey: 'commands.notAllowed.doc-annotate-read',
    },
  ],
  ['style', { categories: ['annotations'] }],
  // The stamp libraries are the stamp plugin's: without it there is nothing to pick.
  [
    'stamps',
    {
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
      categories: ['redaction'],
      allowed: (commandContext) => {
        const redaction = commandContext.tryGet(RedactionToken);
        return redaction ? redaction.canMark() || redaction.canApply() : true;
      },
    },
  ],
  ['measurement', { categories: ['measurement'] }],
  // The form designer's sidebar: for a session that may design forms, and in Form mode only,
  // so it closes as Form mode does (`form:design` is its switch).
  [
    'form-design',
    {
      categories: ['forms.building'],
      allowed: (commandContext) => commandContext.tryGet(FormToken)?.canDesign() ?? true,
      visible: (commandContext) => commandContext.tryGet(ShellToken)?.isOpen('mode:form') ?? false,
    },
  ],
]);

/**
 * A `panel:<id>` command for each of the layout's panels that has none yet (`isTaken` says which
 * ids do): it opens the panel, or closes it when it's open. Without a title, its button reads
 * the panel's id. A search panel brings Find too.
 */
export function panelCommandsFor(
  panels: LayoutData['panels'],
  isTaken: (id: string) => boolean,
): CommandDef[] {
  return Object.entries(panels ?? {}).flatMap(([id, panel]): CommandDef[] => {
    const commandId = panelCommandOf(id);
    if (!isPanel(panel)) return [];
    const find = id === SEARCH_PANEL && !isTaken(FIND_COMMAND.id) ? [FIND_COMMAND] : [];
    if (isTaken(commandId)) return find;
    const { focus, ...facts } = BUILT_IN_PANELS.get(id) ?? {};
    return [
      {
        id: commandId,
        label: panel.title ?? (panel.titleKey === undefined ? id : undefined),
        labelKey: panel.titleKey,
        icon: panel.icon,
        panel: focus ? { id, focus } : id,
        ...facts,
      },
      ...find,
    ];
  });
}

/** Whether two layouts' panels are the same, field for field. */
export const samePanels = (left: Panels | undefined, right: Panels | undefined): boolean =>
  left === right || JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
