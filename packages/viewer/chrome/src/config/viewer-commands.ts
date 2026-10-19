/**
 * Your commands, as the `commands` config gives them, over the built-in ones.
 *
 * A command of yours is the headless command, with functions that get the viewer's words:
 * `get` takes a plugin's name (`get('selection')`) as well as its token, and `viewer` is the
 * viewer `onReady` gets. One with a built-in id merges over the built-in command, so what it
 * leaves out stays: `{ id: 'document:download', run }` keeps Download's label, icon, shortcut
 * and checks. A shortcut of yours takes its keys from every built-in command that has them, so
 * a key runs your command and the built-in one's tooltip no longer shows it.
 */
import { sameShortcut } from '@embedpdf/core-ui';
import type {
  CommandContext as PluginCommandContext,
  CommandDef as PluginCommandDef,
  IconAccent,
} from '@embedpdf/react/commands';
import type { CapabilityToken } from '@embedpdf/react/runtime';

import type { PluginTokens, ScopedViewer, Viewer } from '../handle';
import type { IconName } from '../ui/icons';

/** What a command's functions get: its document, any plugin by its name or token, and the viewer. */
export interface CommandContext extends ScopedViewer {
  /** The document it's for: the one named, else the active one; `null` with none open. */
  readonly documentId: string | null;
  /** What the caller passed: `execute(id, { args })`. */
  readonly args?: unknown;
  /** Fires when the caller cancels `execute()`: pass it on to the calls `run` makes. */
  readonly signal?: AbortSignal;
  /** The viewer, as `onReady` gets it. */
  readonly viewer: Viewer;
}

/**
 * A command, as the `commands` config takes it: the headless command, its functions getting
 * {@link CommandContext}. With a built-in command's id it changes that one, field by field.
 */
export interface CommandDef extends Omit<
  PluginCommandDef,
  'icon' | 'iconAccent' | 'allowed' | 'enabled' | 'active' | 'visible' | 'run'
> {
  /** An icon's name: one of the viewer's, or one of yours (`icons`). */
  readonly icon?: IconName | (string & {});
  /** Colors for the icon, read from live state like `active`. */
  readonly iconAccent?: (context: CommandContext) => IconAccent | null;
  /** Whether the session may run it, from the plugins' `can*` checks. Prefer `requires`. */
  readonly allowed?: (context: CommandContext) => boolean;
  /** When it can run. When it can't, its button is greyed out. Default: always. */
  readonly enabled?: (context: CommandContext) => boolean;
  /** When it shows as pressed, or checked in a menu. */
  readonly active?: (context: CommandContext) => boolean;
  /** When it shows at all. Default: always. */
  readonly visible?: (context: CommandContext) => boolean;
  /** What it does; `execute()` resolves once it has. Not needed for a `menu` or `panel`. */
  readonly run?: (context: CommandContext) => void | Promise<unknown>;
}

/** What a command of yours reaches: the viewer's plugins by name, and the viewer once it's live. */
export interface CommandScope {
  readonly plugins: PluginTokens;
  /** The viewer now, or `null` before it's live. */
  viewer(): Viewer | null;
}

const FUNCTIONS = ['iconAccent', 'allowed', 'enabled', 'active', 'visible', 'run'] as const;

/** Fields that go together: giving one of them replaces all of the built-in command's. */
const TOGETHER: readonly (readonly (keyof PluginCommandDef)[])[] = [
  ['label', 'labelKey'],
  ['run', 'menu', 'panel', 'modal'],
];

/** The viewer's words over a command's context: plugins by name, and the viewer. */
function viewerContextOf(context: PluginCommandContext, scope: CommandScope): CommandContext {
  const tokenOf = (plugin: string | CapabilityToken<unknown>): CapabilityToken<unknown> | null =>
    typeof plugin !== 'string'
      ? plugin
      : Object.prototype.hasOwnProperty.call(scope.plugins, plugin)
        ? (scope.plugins[plugin] ?? null)
        : null;
  const get = ((plugin: string | CapabilityToken<unknown>): unknown => {
    const token = tokenOf(plugin);
    if (!token) {
      throw new Error(
        `[embedpdf] the viewer has no plugin named "${String(plugin)}". Its plugins: ` +
          `${Object.keys(scope.plugins).join(', ')}.`,
      );
    }
    return context.get(token);
  }) as ScopedViewer['get'];
  const tryGet = ((plugin: string | CapabilityToken<unknown>): unknown => {
    const token = tokenOf(plugin);
    return token ? context.tryGet(token) : null;
  }) as ScopedViewer['tryGet'];
  return {
    documentId: context.documentId,
    ...(context.args === undefined ? {} : { args: context.args }),
    ...(context.signal ? { signal: context.signal } : {}),
    get,
    tryGet,
    get viewer(): Viewer {
      const viewer = scope.viewer();
      if (!viewer) throw new Error('[embedpdf] the viewer is not live yet');
      return viewer;
    },
  };
}

/** A command of yours as the commands plugin takes it: each function gets the viewer's words. */
export function toPluginCommand(command: CommandDef, scope: CommandScope): PluginCommandDef {
  // One context per resolution: a command's functions are all asked with the same one.
  const contexts = new WeakMap<PluginCommandContext, CommandContext>();
  const contextOf = (context: PluginCommandContext): CommandContext => {
    let viewerContext = contexts.get(context);
    if (!viewerContext) {
      viewerContext = viewerContextOf(context, scope);
      contexts.set(context, viewerContext);
    }
    return viewerContext;
  };
  const converted: Record<string, unknown> = { ...command };
  for (const name of FUNCTIONS) {
    const given = command[name] as ((context: CommandContext) => unknown) | undefined;
    if (given) converted[name] = (context: PluginCommandContext) => given(contextOf(context));
  }
  return converted as unknown as PluginCommandDef;
}

/** A built-in command with yours over it: what yours gives replaces, the rest stays. */
export function mergeCommand(builtIn: PluginCommandDef, yours: PluginCommandDef): PluginCommandDef {
  const merged: Record<string, unknown> = { ...builtIn };
  for (const fields of TOGETHER) {
    if (!fields.some((field) => yours[field] !== undefined)) continue;
    for (const field of fields) delete merged[field];
  }
  for (const [field, value] of Object.entries(yours))
    if (value !== undefined) merged[field] = value;
  return merged as unknown as PluginCommandDef;
}

const shortcutsOf = (command: Pick<PluginCommandDef, 'shortcut'>): readonly string[] =>
  command.shortcut === undefined ? [] : ([] as string[]).concat(command.shortcut);

/** The commands the viewer registers, from the built-in ones and yours. */
export interface ViewerCommands {
  /** The built-in commands with yours merged over them, then the rest of yours, in order. */
  readonly commands: readonly PluginCommandDef[];
  /** Whether a command with this id is yours alone: no built-in command has the id. */
  isYours(id: string): boolean;
  /**
   * A built-in command as yours changes it: without the keys your shortcuts take, and with
   * yours of the same id merged over it. For the commands the layout brings, its panels' and
   * modes'.
   */
  over(builtIn: PluginCommandDef): PluginCommandDef;
}

/** No commands of yours: the built-in ones as they are. */
export const NO_VIEWER_COMMANDS: ViewerCommands = {
  commands: [],
  isYours: () => false,
  over: (builtIn) => builtIn,
};

/**
 * Your commands over the built-in ones. A later command of yours with an id that's taken
 * replaces the earlier one. `isMac` says which keys `Mod` is, to tell two shortcuts apart.
 */
export function resolveViewerCommands(
  builtIns: readonly PluginCommandDef[],
  given: readonly CommandDef[],
  scope: CommandScope,
  options: { readonly isMac: boolean },
): ViewerCommands {
  const yours = new Map<string, PluginCommandDef>();
  for (const command of given) yours.set(command.id, toPluginCommand(command, scope));
  const taken = [...yours.values()].flatMap(shortcutsOf);
  const isTaken = (shortcut: string): boolean =>
    taken.some((key) => {
      try {
        return sameShortcut(key, shortcut, options);
      } catch {
        return false;
      }
    });
  const over = (builtIn: PluginCommandDef): PluginCommandDef => {
    const shortcuts = shortcutsOf(builtIn);
    const kept = shortcuts.filter((shortcut) => !isTaken(shortcut));
    const base = kept.length === shortcuts.length ? builtIn : { ...builtIn, shortcut: kept };
    const own = yours.get(builtIn.id);
    return own ? mergeCommand(base, own) : base;
  };
  const builtInIds = new Set(builtIns.map((command) => command.id));
  return {
    commands: [
      ...builtIns.map(over),
      ...[...yours.values()].filter((command) => !builtInIds.has(command.id)),
    ],
    isYours: (id) => yours.has(id) && !builtInIds.has(id),
    over,
  };
}
