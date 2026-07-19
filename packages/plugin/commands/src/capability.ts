import type { CapabilityToken, PluginContext } from '@embedpdf/core';
import { I18nToken } from '@embedpdf/plugin-i18n';
import { ShellToken } from '@embedpdf/plugin-shell';
import { matchShortcut, parseShortcut } from '@embedpdf/core-ui';
import type { KeyStroke, ParsedShortcut } from '@embedpdf/core-ui';
import type {
  CommandCtx,
  CommandDef,
  CommandsAction,
  CommandsCapability,
  CommandsState,
  IconAccent,
  ResolvedCommand,
} from './types';

/** A registered command: the definition plus its pre-parsed shortcuts. */
export interface RegisteredCommand {
  readonly def: CommandDef;
  readonly shortcuts: readonly string[];
  readonly parsed: readonly ParsedShortcut[];
}

export type CommandRegistry = Map<string, RegisteredCommand>;

export function registerCommand(registry: CommandRegistry, def: CommandDef): void {
  if (registry.has(def.id)) throw new Error(`[commands] duplicate command: ${def.id}`);
  const shortcuts = def.shortcut === undefined ? [] : ([] as string[]).concat(def.shortcut);
  registry.set(def.id, { def, shortcuts, parsed: shortcuts.map(parseShortcut) });
}

const panelTarget = (def: CommandDef): { id: string; exclusive?: string } | null =>
  def.panel === undefined ? null : typeof def.panel === 'string' ? { id: def.panel } : def.panel;

export function createCommandsCapability(
  ctx: PluginContext<CommandsState, CommandsAction>,
  registry: CommandRegistry,
): CommandsCapability {
  /** Bind capability resolution to the command's target document. The kernel
   *  resolves workspace tokens regardless of the document argument, so one
   *  code path serves both scopes. */
  const commandCtx = (documentId?: string): CommandCtx => {
    const target = documentId ?? ctx.core().activeId;
    const get = <T>(token: CapabilityToken<T>): T =>
      target ? ctx.forDocument(token, target) : ctx.get(token);
    return {
      documentId: target,
      core: ctx.core,
      get,
      tryGet: <T>(token: CapabilityToken<T>): T | null => {
        try {
          return get(token);
        } catch {
          return null;
        }
      },
    };
  };

  /** Derivations run against live state; a derivation that throws (e.g. it
   *  needs a document and none is open) falls back to the safe default —
   *  the button renders, disabled, exactly like v2's empty state. */
  const derive = (
    fn: ((c: CommandCtx) => boolean) | undefined,
    c: CommandCtx,
    fallback: boolean,
  ): boolean => {
    if (!fn) return fallback;
    try {
      return fn(c);
    } catch {
      return fallback;
    }
  };

  /** Same guard as `derive`, for the icon-accent derivation: a throw (no
   *  document, provider missing) means "no accent" — the icon renders plain. */
  const deriveAccent = (
    fn: ((c: CommandCtx) => IconAccent | null) | undefined,
    c: CommandCtx,
  ): IconAccent | undefined => {
    if (!fn) return undefined;
    try {
      return fn(c) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const resolve = (id: string, documentId?: string): ResolvedCommand | null => {
    const entry = registry.get(id);
    if (!entry) return null;
    const { def } = entry;
    const c = commandCtx(documentId);

    const disabled = ctx.getState().disabledCategories;
    const categoryHidden = (def.categories ?? []).some((cat) => disabled.includes(cat));

    const i18n = c.tryGet(I18nToken);
    const label = i18n ? i18n.t(def.labelKey) : def.labelKey;

    // Surface-target commands derive `active` from the surface's open state
    // unless the definition overrides it.
    let active: boolean;
    if (def.active) {
      active = derive(def.active, c, false);
    } else {
      const shell = c.tryGet(ShellToken);
      const panel = panelTarget(def);
      active = shell
        ? def.menu
          ? shell.isMenuOpen(def.menu)
          : panel
            ? shell.isOpen(panel.id)
            : def.modal
              ? shell.isOpen(def.modal)
              : false
        : false;
    }

    return {
      id: def.id,
      label,
      icon: def.icon,
      iconAccent: deriveAccent(def.iconAccent, c),
      shortcuts: entry.shortcuts,
      menu: def.menu,
      enabled: derive(def.enabled, c, true) && !categoryHidden,
      active,
      visible: derive(def.visible, c, true) && !categoryHidden,
      categories: def.categories ?? [],
    };
  };

  const execute = (id: string, documentId?: string): void => {
    const entry = registry.get(id);
    if (!entry) return;
    const resolved = resolve(id, documentId);
    if (!resolved || !resolved.enabled || !resolved.visible) return;
    const c = commandCtx(documentId);

    if (entry.def.run) {
      entry.def.run(c);
      return;
    }
    // Default routing for declarative surface targets.
    const shell = c.tryGet(ShellToken);
    if (!shell) return;
    const panel = panelTarget(entry.def);
    if (entry.def.menu) shell.toggleMenu(entry.def.menu);
    else if (panel) shell.toggle(panel.id, { exclusive: panel.exclusive });
    else if (entry.def.modal) shell.toggle(entry.def.modal, { exclusive: 'modal' });
  };

  return {
    register: (def) => registerCommand(registry, def),
    unregister: (id) => void registry.delete(id),
    has: (id) => registry.has(id),
    ids: () => [...registry.keys()],

    resolve,
    search: (query, documentId) => {
      const q = query.trim().toLowerCase();
      const hits: ResolvedCommand[] = [];
      for (const id of registry.keys()) {
        const r = resolve(id, documentId);
        if (!r || !r.visible) continue;
        if (q === '' || r.label.toLowerCase().includes(q) || r.id.includes(q)) hits.push(r);
      }
      return hits;
    },
    menuTarget: (id) => {
      const entry = registry.get(id);
      return entry ? { menu: entry.def.menu } : null;
    },

    execute,
    matchStroke: (stroke: KeyStroke, opts) => {
      for (const [id, entry] of registry) {
        if (entry.parsed.some((p) => matchShortcut(p, stroke, opts))) return id;
      }
      return null;
    },

    disabledCategories: () => ctx.getState().disabledCategories,
    isCategoryDisabled: (category) => ctx.getState().disabledCategories.includes(category),
    disableCategory: (category) => ctx.dispatch({ type: 'COMMANDS/DISABLE_CATEGORY', category }),
    enableCategory: (category) => ctx.dispatch({ type: 'COMMANDS/ENABLE_CATEGORY', category }),
    setDisabledCategories: (categories) =>
      ctx.dispatch({ type: 'COMMANDS/SET_DISABLED_CATEGORIES', categories }),
  };
}
