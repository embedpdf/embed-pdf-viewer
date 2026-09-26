/**
 * The commands controller: the registry, resolution against a target
 * document (pure derivations over the store, throw-safe), the one execution
 * path, category gating, and the host-only keystroke matcher.
 */
import {
  createEventHook,
  toPluginError,
  toPluginErrorInfo,
  type CapabilityToken,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';
import { matchShortcut, type KeyStroke } from '@embedpdf/core-ui';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { ShellToken } from '@embedpdf/plugin-shell/contract';

import { resolvedCommandsEqual } from './contract';
import type {
  CommandContext,
  CommandDef,
  CommandExecutedEvent,
  CommandExecutionFailedEvent,
  CommandsConfig,
  ExecuteResult,
  IconAccent,
  ResolvedCommand,
} from './contract';
import type { CommandsHostCapability } from './host-contract';
import type { CommandsAction, CommandsState } from './model';
import { registerCommand, type CommandRegistry, type RegisteredCommand } from './registry';

const panelTarget = (def: CommandDef): { id: string; exclusive?: string } | null =>
  def.panel === undefined ? null : typeof def.panel === 'string' ? { id: def.panel } : def.panel;

export function createCommandsController(
  ctx: PluginContext<CommandsState, CommandsAction>,
  config: CommandsConfig = {},
): CommandsHostCapability {
  const registry: CommandRegistry = new Map();
  for (const def of config.commands ?? []) registerCommand(registry, def);
  const report = (error: unknown) =>
    globalThis.console?.error('[commands] listener failed:', error);
  const executed = createEventHook<CommandExecutedEvent>(report);
  const executionFailed = createEventHook<CommandExecutionFailedEvent>(report);
  ctx.cleanup(() => {
    executed.dispose();
    executionFailed.dispose();
  });

  /** Bind capability resolution to the command's target document. The kernel
   *  resolves workspace tokens regardless of the document argument, so one
   *  code path serves both scopes. */
  const commandContext = (documentId?: string, args?: unknown): CommandContext => {
    const target = documentId ?? ctx.core().activeId;
    const get = <T>(token: CapabilityToken<T>): T =>
      target ? ctx.forDocument(token, target) : ctx.get(token);
    return {
      documentId: target,
      ...(args === undefined ? {} : { args }),
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
    fn: ((c: CommandContext) => boolean) | undefined,
    c: CommandContext,
    fallback: boolean,
  ): boolean => {
    if (!fn) return fallback;
    try {
      return fn(c);
    } catch {
      return fallback;
    }
  };
  const deriveAccent = (
    fn: ((c: CommandContext) => IconAccent | null) | undefined,
    c: CommandContext,
  ): IconAccent | undefined => {
    if (!fn) return undefined;
    try {
      return fn(c) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const resolveFresh = (entry: RegisteredCommand, documentId?: string): ResolvedCommand => {
    const { def } = entry;
    const c = commandContext(documentId);
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

  /** Reference-stable resolution: the previous object comes back while nothing changed. */
  const resolved = new Map<string, ResolvedCommand>();
  const resolveCommand = (id: string, documentId?: string): ResolvedCommand | null => {
    const entry = registry.get(id);
    if (!entry) return null;
    const key = `${documentId ?? ''}|${id}`;
    const fresh = resolveFresh(entry, documentId);
    const previous = resolved.get(key);
    if (previous && resolvedCommandsEqual(previous, fresh)) return previous;
    resolved.set(key, fresh);
    return fresh;
  };
  const listed = new Map<string, readonly ResolvedCommand[]>();
  const listCommands = (documentId?: string): readonly ResolvedCommand[] => {
    const key = documentId ?? '';
    const next = [...registry.keys()].flatMap((id) => {
      const r = resolveCommand(id, documentId);
      return r ? [r] : [];
    });
    const previous = listed.get(key);
    if (previous && previous.length === next.length && previous.every((r, i) => r === next[i])) {
      return previous;
    }
    listed.set(key, next);
    return next;
  };

  const execute = async (
    id: string,
    options: { documentId?: string; args?: unknown } = {},
  ): Promise<ExecuteResult> => {
    const entry = registry.get(id);
    if (!entry) return { status: 'rejected', reason: 'not-found' };
    const r = resolveCommand(id, options.documentId);
    if (!r || !r.visible) return { status: 'rejected', reason: 'hidden' };
    if (!r.enabled) return { status: 'rejected', reason: 'disabled' };
    const c = commandContext(options.documentId, options.args);
    try {
      if (entry.def.run) {
        await entry.def.run(c);
      } else {
        // Default routing for declarative surface targets.
        const shell = c.tryGet(ShellToken);
        const panel = panelTarget(entry.def);
        if (shell) {
          if (entry.def.menu) shell.toggleMenu(entry.def.menu);
          else if (panel) shell.toggle(panel.id, { exclusive: panel.exclusive });
          else if (entry.def.modal) shell.toggle(entry.def.modal, { exclusive: 'modal' });
        }
      }
    } catch (error) {
      const failure = toPluginError('commands', error);
      executionFailed.emit({
        commandId: id,
        documentId: c.documentId,
        error: toPluginErrorInfo(failure),
      });
      throw failure;
    }
    executed.emit({ commandId: id, documentId: c.documentId, args: options.args });
    return { status: 'executed' };
  };

  const registerOne = (def: CommandDef, options?: { replace?: boolean }): Unsubscribe => {
    const entry = registerCommand(registry, def, options);
    return () => {
      if (registry.get(def.id) === entry) registry.delete(def.id);
    };
  };

  return {
    registerCommand: registerOne,
    registerCommands: (defs, options) => {
      const removers = defs.map((def) => registerOne(def, options));
      return () => removers.forEach((remove) => remove());
    },
    hasCommand: (id) => registry.has(id),
    getCommand: (id) => registry.get(id)?.def ?? null,
    listCommandIds: () => [...registry.keys()],
    resolveCommand,
    listCommands,
    searchCommands: (query, documentId) => {
      const q = query.trim().toLowerCase();
      return listCommands(documentId).filter(
        (r) => r.visible && (q === '' || r.label.toLowerCase().includes(q) || r.id.includes(q)),
      );
    },
    listShortcuts: () =>
      [...registry.values()].flatMap((entry) =>
        entry.shortcuts.map((shortcut) => ({ commandId: entry.def.id, shortcut })),
      ),
    execute,
    canExecute: (id, documentId) => {
      const r = resolveCommand(id, documentId);
      return !!r && r.enabled && r.visible;
    },
    getDisabledCategories: () => ctx.getState().disabledCategories,
    isCategoryDisabled: (category) => ctx.getState().disabledCategories.includes(category),
    disableCategory: (category) => ctx.dispatch({ type: 'COMMANDS/DISABLE_CATEGORY', category }),
    enableCategory: (category) => ctx.dispatch({ type: 'COMMANDS/ENABLE_CATEGORY', category }),
    setDisabledCategories: (categories) =>
      ctx.dispatch({ type: 'COMMANDS/SET_DISABLED_CATEGORIES', categories }),
    onExecuted: executed.on,
    onExecutionFailed: executionFailed.on,
    // ── host lens ──
    matchStroke: (stroke: KeyStroke, options) => {
      for (const [id, entry] of registry) {
        if (entry.parsed.some((p) => matchShortcut(p, stroke, options))) return id;
      }
      return null;
    },
    getMenuTarget: (id) => {
      const entry = registry.get(id);
      return entry ? { menu: entry.def.menu } : null;
    },
  } satisfies CommandsHostCapability;
}
