/**
 * What a command is: the types a plugin writes its commands with. The commands
 * plugin (`@embedpdf/plugin-commands`) runs them; a plugin that ships commands
 * (its `/commands` entry) needs only these types, so it does not depend on the
 * commands plugin.
 */
import type { SettingLock } from './settings';
import type { CapabilityToken, Permission } from './types';

/**
 * What a command's derivations and `run` see: capabilities resolved for the command's document
 * (the one named, else the document in scope, else the active one), and your app's state.
 */
export interface CommandContext<AppState = any> {
  /** The command's document, or `null` when none is open. */
  readonly documentId: string | null;
  /** Your app's state, as the `appState` setting has it now: `any` until you give its type. */
  readonly appState: AppState;
  /** What the caller passed: `execute(id, { args })`. */
  readonly args?: unknown;
  /** Fires when the caller cancels `execute()`: pass it on to the calls `run` makes. */
  readonly signal?: AbortSignal;
  /** A capability, for the command's document when the plugin is document-scoped. Throws when it isn't available. */
  get<T>(token: CapabilityToken<T>): T;
  /** Like `get`, but `null` when the capability isn't available (no plugin, no document). */
  tryGet<T>(token: CapabilityToken<T>): T | null;
}

/**
 * Up to two colors that go with a command's icon, such as a tool's current color: data a
 * renderer may use (tint the icon, show a swatch), like `icon` itself.
 */
export interface IconAccent {
  /** The mark: a stroke, the markup or the text color. */
  readonly primary?: string;
  /** The fill, when there is one. */
  readonly secondary?: string;
}

/**
 * One command, as you define it. Its functions get your app's state as `AppState`; they're
 * methods, so a command typed for your state (`CommandDefinition<Review>`) goes wherever a command does.
 */
export interface CommandDefinition<AppState = any> {
  /** A unique name, by convention `area:action`: `'zoom:in'`, `'review:approve'`. */
  readonly id: string;
  /**
   * What the user sees. With `labelKey` too, it's what shows when no language has the key. Its
   * `{name}` slots take the values `labelParams` gives.
   */
  readonly label?: string;
  /**
   * A translation key for the label, read through the i18n plugin. Without the plugin, or a
   * string for the key, the command shows `label`, else the key. The string's `{name}` slots
   * take the values `labelParams` gives, and a number `count` picks its plural form.
   */
  readonly labelKey?: string;
  /** Your icon's name; your buttons turn it into an icon. */
  readonly icon?: string;
  /** Colors for the icon, read from live state like `active`. */
  iconAccent?(context: CommandContext<AppState>): IconAccent | null;
  /** A key such as `'Mod+K'` (`Mod` is Cmd on a Mac, Ctrl elsewhere), or a list of them. */
  readonly shortcut?: string | readonly string[];
  /**
   * Whether its shortcut also runs while the cursor is in a text field where the shortcuts
   * listen (a search box, a comment), as the viewer's Find does. Default false: a key typed in
   * a field is the field's.
   */
  readonly shortcutInTextFields?: boolean;
  /**
   * The features it belongs to, so turning one off turns it off: `['annotations.highlight']`.
   * Turning off a feature turns off every feature under it, on whole dotted parts: `annotations`
   * covers `annotations.highlight`, not `annotationsExtra`.
   */
  readonly categories?: readonly string[];
  /**
   * The scope permissions it needs, such as `'doc.annotate.modify'`, checked against its
   * document. Without them it's hidden, or shown disabled with its reason under the
   * `notAllowed: 'disable'` setting. With no document open there is nothing to check.
   */
  readonly requires?: readonly Permission[];
  /**
   * Whether the session may run it, from the plugins' `can*` checks
   * (`documents.canPrint()`), for a command whose permission is a plugin's to know. When it
   * says no, the command isn't allowed, as with `requires`. Asked only while a document is
   * open; one that throws allows it.
   */
  allowed?(context: CommandContext<AppState>): boolean;
  /**
   * The translation key of the sentence that says why `allowed` refused it, with `{label}` for
   * its label: `'commands.notAllowed.doc-print'`. Without it, or a string for it,
   * `commands.notAllowed.default`.
   */
  readonly notAllowedKey?: string;
  /**
   * The lock on the setting it changes, for a command that changes one
   * (`(context) => context.get(StageToken).getLock('spread')`), or `null`.
   * While a lock holds, it shows disabled, whatever the `notAllowed` setting
   * says, with the sentence under the lock's `reasonKey` (else
   * `commands.locked.default`) as its `disabledReason`; it stays `active` for
   * its own value. One that throws counts as unlocked.
   */
  locked?(context: CommandContext<AppState>): SettingLock | null;

  // ── what the command opens ───────────────────────────────────────────────
  // A command that opens a panel, menu or dialog says so instead of opening
  // it in `run`: it then needs no `run`, it shows as active while the surface
  // is open, and a button can show that it opens a menu.
  /** Opens and closes a menu of yours, by its id. */
  readonly menu?: string;
  /**
   * Opens and closes a panel, closing the others with the same `exclusive` tag. With `focus`,
   * opening it asks for the cursor (the shell's `open(id, { focus: true })`).
   */
  readonly panel?:
    | string
    | { readonly id: string; readonly exclusive?: string; readonly focus?: boolean };
  /** Opens and closes a dialog; one dialog is open at a time. */
  readonly modal?: string;

  // ── read from live state and your app's, again whenever either changes ──
  /** When it can run. Default: always. One that throws counts as false. */
  enabled?(context: CommandContext<AppState>): boolean;
  /** When it shows as pressed, such as the current tool. One that throws counts as false. */
  active?(context: CommandContext<AppState>): boolean;
  /** When it shows at all. Default: always. One that throws counts as false. */
  visible?(context: CommandContext<AppState>): boolean;
  /**
   * The values for its label's `{name}` slots, such as how many pages are selected:
   * `({ count: pageEdit.getSelected().length })`. A number `count` also picks the plural form of a
   * translated label. One that throws gives none, and the slots show as they are.
   */
  labelParams?(context: CommandContext<AppState>): Readonly<Record<string, string | number>>;

  /** What it does; `execute()` resolves once it has. Not needed for a `menu`, `panel` or `modal`. */
  run?(context: CommandContext<AppState>): void | Promise<unknown>;
}

/**
 * A command for each of a set of names, made from one definition, such as `tool:<id>` for every
 * tool a document has. Its commands resolve and run like any other, and `listCommands()` lists
 * one per name. A command defined with the same id wins over the family's.
 */
export interface CommandFamily {
  /** Where the commands' ids start: `'tool:'` makes `tool:highlight`. */
  readonly prefix: string;
  /** The names the command's document has, in order. Return the same array while nothing changed. */
  readonly names: (context: CommandContext) => readonly string[];
  /** The command for one name. A family's commands have no shortcuts. */
  readonly command: (name: string) => Omit<CommandDefinition, 'id' | 'shortcut'>;
}
