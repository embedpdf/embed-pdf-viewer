/**
 * The commands plugin's service, features and directives: every action of the viewer, with its
 * label, icon, state and shortcut, run from buttons, menus and keys.
 *
 *   withCommands({ commands })          the plugin, for provideEmbedPdf()
 *   withCommandShortcuts()              every command's shortcut as a working key
 *   inject(EpdfCommands)                `execute()`, `searchCommands()`, `executed$`, the settings
 *   <button [epdfCommand]="'zoom:in'">  a button of yours that runs and shows a command
 *   <div epdfCommandShortcuts>          the keys, only while focus is inside that element
 *
 * A command's state is read from live state, so what shows a command follows the viewer's one
 * change stream and changes only when what the command shows did.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  Injectable,
  input,
  output,
  PLATFORM_ID,
  untracked,
  type Signal,
} from '@angular/core';
import {
  CapabilityBinding,
  devWarn,
  EpdfKernelHost,
  injectKernelHost,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import { formatShortcut as formatKeys } from '@embedpdf/core-ui';
import {
  boundCommandOf,
  commandsPlugin,
  CommandsToken,
  resolvedCommandsEqual,
  unknownCommandWarning,
  unregisteredCommand,
} from '@embedpdf/plugin-commands';
import type {
  BoundCommand,
  CommandId,
  CommandRefusal,
  CommandsConfig,
  ExecuteResult,
} from '@embedpdf/plugin-commands';
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import type { CommandsHostCapability } from '@embedpdf/plugin-commands/contract/host';
import { createStandardCommands } from '@embedpdf/plugin-commands/standard';
import { bindCommandShortcuts, isMacPlatform, standardCommandsBrowser } from '@embedpdf/web';

/**
 * The commands every viewer has: zoom, pages, view rotation, `tool:<id>` for every tool, copy,
 * delete, download and print, with shortcuts and labels in EmbedPDF's eight languages. Spread
 * them into `withCommands({ commands })`.
 */
export const standardCommands = /* @__PURE__ */ createStandardCommands(standardCommandsBrowser);

/** A shortcut as a tooltip shows it, for this platform: `'⌘K'` on a Mac, `'Ctrl+K'` elsewhere. */
export function formatShortcut(shortcut: string, options: { isMac?: boolean } = {}): string {
  return formatKeys(shortcut, { isMac: options.isMac ?? isMacPlatform() });
}

/**
 * The commands: `execute()`, `canExecute()`, `resolveCommand()`, `searchCommands()`,
 * `listShortcuts()`, `registerCommand()`, the categories, `executed$` and
 * `executionFailed$`, and the settings. A call that leaves out the document is for this part
 * of the template's document: the one `[epdfDocumentScope]` names, else the active one.
 */
@Injectable({ providedIn: 'root' })
export class EpdfCommands extends pluginService({
  name: 'EpdfCommands',
  feature: 'withCommands()',
  token: CommandsToken,
  methods: [
    'execute',
    'canExecute',
    'resolveCommand',
    'listCommands',
    'searchCommands',
    'listShortcuts',
    'registerCommand',
    'registerCommands',
    'getCommand',
    'hasCommand',
    'listCommandIds',
    'getDisabledCategories',
    'isCategoryDisabled',
    'disableCategory',
    'enableCategory',
    'setDisabledCategories',
  ],
  events: ['onExecuted', 'onExecutionFailed'],
}) {
  /**
   * One command as a signal, for what shows a command and isn't a button (a row of a shortcut
   * sheet): its label, icon and state, `run()` and `shortcut`. Changes only when what the
   * command shows does. Pass a function for an id that changes. A button uses the `epdfCommand`
   * directive instead. Always a command: an id no plugin registered (or one asked for before
   * the commands plugin is there) is labelled with its id, neither visible nor enabled, and an
   * unknown one warns once in development.
   */
  commandOf(id: string | (() => string)): Signal<BoundCommand> {
    const idOf = typeof id === 'function' ? id : () => id;
    const resolved = this.binding.select(
      (commands) => commands.resolveCommand(idOf()),
      null,
      resolvedCommandsEqual,
    );
    const execute = this.binding.method('execute');
    return computed(() => {
      const command = resolved();
      const requested = idOf();
      const commands = this.binding.capability();
      if (command === null && commands !== null) {
        devWarn(
          `commandOf:${requested}`,
          `commandOf(): ${unknownCommandWarning(requested, commands.listCommandIds())}`,
        );
      }
      return boundCommandOf(command ?? unregisteredCommand(requested), execute, {
        isMac: isMacPlatform(),
      });
    });
  }
}

/** The commands plugin, with its settings: `withCommands({ commands: standardCommands })`. */
export function withCommands(options?: CommandsConfig): EmbedPdfFeature {
  return { plugins: [commandsPlugin(options)], services: [EpdfCommands] };
}

/**
 * The commands for keyboard shortcuts: the host lens of the same plugin, which matches a
 * keystroke to a command. For the workspace, so the keys run for the active document.
 */
function shortcutCommands(host: EpdfKernelHost): Signal<CommandsHostCapability | null> {
  return new CapabilityBinding(
    host,
    () => CommandsHostToken,
    () => null,
  ).capability;
}

/** A key whose command is turned off or not allowed, and why: what `(refused)` carries. */
export interface RefusedShortcut {
  readonly commandId: CommandId;
  readonly refusal: CommandRefusal;
}

/**
 * Every command's shortcut as a working key, anywhere on the page, for the active document.
 * Keys typed into text fields are left alone, and so is a key whose command can't run right
 * now. A command that's turned off or not allowed still takes its key, and `onRefused` says
 * why. Add it next to `withCommands()`; for a page with more than one viewer, put
 * `epdfCommandShortcuts` on the element around each one instead.
 */
export function withCommandShortcuts(options?: {
  isMac?: boolean;
  onRefused?: (commandId: CommandId, refusal: CommandRefusal) => void;
}): EmbedPdfFeature {
  return {
    plugins: [],
    setup: () => {
      const commands = shortcutCommands(inject(EpdfKernelHost));
      // The commands exist once the viewer's engine is there; the keys go with the viewer.
      effect((onCleanup) => {
        const current = commands();
        if (current) {
          onCleanup(
            bindCommandShortcuts(current, {
              isMac: options?.isMac,
              onRefused: options?.onRefused,
            }),
          );
        }
      });
    },
  };
}

/**
 * Every command's shortcut as a working key, while focus is inside this element: for a page
 * with more than one viewer, or keys that should leave the rest of the page alone. Give the
 * element a `tabindex` so a click on it gives it focus. A key whose command is turned off or
 * not allowed fires `(refused)`.
 *
 *   <div class="viewer" tabindex="0" epdfCommandShortcuts (refused)="say($event.refusal.message)">
 */
@Directive({ selector: '[epdfCommandShortcuts]' })
export class EpdfCommandShortcuts {
  /** A key whose command is turned off or not allowed: say why. */
  readonly refused = output<RefusedShortcut>();

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const commands = shortcutCommands(injectKernelHost('epdfCommandShortcuts'));
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      const current = commands();
      if (!current) return;
      onCleanup(
        bindCommandShortcuts(current, {
          target: element,
          onRefused: (commandId, refusal) => this.refused.emit({ commandId, refusal }),
        }),
      );
    });
  }
}

/**
 * A button of yours that runs a command and shows its state: a click runs it, and the button's
 * `disabled`, `aria-pressed`, `title` and `hidden` follow the command. The template reference
 * gives the rest as signals:
 *
 *   <button [epdfCommand]="'zoom:in'" #zoomIn="epdfCommand">
 *     {{ zoomIn.label() }} <kbd>{{ zoomIn.shortcut() }}</kbd>
 *   </button>
 *
 * It runs and reads the command for this part of the template's document. An unknown id
 * hides the button.
 */
@Directive({
  selector: '[epdfCommand]',
  exportAs: 'epdfCommand',
  host: {
    '(click)': 'onClick()',
    '[attr.disabled]': 'enabled() ? null : ""',
    '[attr.aria-pressed]': 'active() ? "true" : null',
    '[attr.title]': 'label() || null',
    '[hidden]': '!visible()',
  },
})
export class EpdfCommand {
  /** The command's id: `'zoom:in'`. */
  readonly id = input.required<string>({ alias: 'epdfCommand' });

  /** The command; an unknown id is neither visible nor enabled, so its button is hidden. */
  readonly command: Signal<BoundCommand> = inject(EpdfCommands).commandOf(() => this.id());
  /** What the user sees. */
  readonly label: Signal<string> = computed(() => this.command().label);
  /** Your icon's name for it, when the command has one. */
  readonly icon: Signal<string | undefined> = computed(() => this.command().icon);
  /** Its first shortcut, formatted for the platform (`'⌘K'`), or `null`. */
  readonly shortcut: Signal<string | null> = computed(() => this.command().shortcut);
  /** Whether it can run now. */
  readonly enabled: Signal<boolean> = computed(() => this.command().enabled);
  /** Whether it shows as pressed, such as the current tool. */
  readonly active: Signal<boolean> = computed(() => this.command().active);
  /** Whether it shows at all. */
  readonly visible: Signal<boolean> = computed(() => this.command().visible);

  /** Run the command for this part of the template's document. Resolves `{ status }`, like `execute()`. */
  run(): Promise<ExecuteResult> {
    return untracked(this.command).run();
  }

  protected onClick(): void {
    // A command whose `run` throws reports it through `executionFailed$`.
    this.run().catch(() => {});
  }
}
