/**
 * The toolbar's plain parts, for every part the app leaves out: the "More" button, a popover
 * menu, a folded group and a group's shed-items button. They're meant to be replaced, so their
 * colors come from the `--epdf-toolbar-*` CSS variables only. The menu takes the menu keys
 * (`attachMenuKeys`) while it's open.
 */
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  type Signal,
} from '@angular/core';
import { groupMenuView, type OverflowRow } from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import {
  attachMenuKeys,
  focusablesIn,
  observeOutsidePress,
  paintDefault,
  type Orientation,
} from '@embedpdf/web';
import type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './templates';

const SURFACE = paintDefault('toolbar-surface');
const BORDER = paintDefault('toolbar-border');
const ACTIVE = paintDefault('toolbar-active');

/** The colors, for the toolbar's own default command button and separator. */
export const TOOLBAR_PAINT = { surface: SURFACE, border: BORDER, active: ACTIVE } as const;

/** Where a menu opens: under a horizontal toolbar's button, beside a vertical one's. */
const placementOf = (orientation: Orientation): string =>
  orientation === 'vertical'
    ? 'top: 0; inset-inline-start: 100%;'
    : 'top: 100%; inset-inline-end: 0;';

/** The plain "More" button: ⋯, pressed while its menu is open. */
@Component({
  selector: 'epdf-toolbar-more-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
  template: `
    <button
      type="button"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      title="More"
      [style]="style"
      [style.background]="open() ? active : 'transparent'"
      (click)="toggle.emit()"
    >
      ⋯
    </button>
  `,
})
export class EpdfToolbarMoreButton {
  readonly open = input(false);
  readonly toggle = output<void>();

  protected readonly active = ACTIVE;
  protected readonly style =
    'display: inline-flex; align-items: center; padding: 4px 8px; color: inherit; ' +
    `font: inherit; border: 1px solid ${BORDER}; border-radius: 4px; cursor: pointer;`;
}

/**
 * The plain popover menu, under its button in a horizontal toolbar and beside it in a vertical
 * one: a press outside closes it, a row runs its command, and while it's open it takes the menu
 * keys: focus on its first row, the arrows, typeahead, Enter, and Escape back to its button.
 */
@Component({
  selector: 'epdf-toolbar-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
  template: `
    @if (isOpen()) {
      <div #menu role="menu" [style]="menuStyle()">
        @for (section of view().sections; track $index; let first = $first) {
          @if (!first) {
            <div [style]="dividerStyle"></div>
          }
          @for (row of section.rows; track row.command) {
            @if (view().resolve(row.command); as command) {
              <button
                type="button"
                [attr.role]="section.role === 'radio' ? 'menuitemradio' : 'menuitem'"
                [attr.aria-checked]="section.role === 'radio' ? command.active : null"
                [disabled]="!command.enabled"
                tabindex="-1"
                [style]="rowStyle"
                [style.cursor]="command.enabled ? 'pointer' : 'default'"
                [style.opacity]="command.enabled ? 1 : 0.4"
                (click)="choose(row)"
              >
                <span
                  >{{ command.active && section.role === 'radio' ? '• ' : ''
                  }}{{ command.label }}</span
                >
                @if (row.type === 'submenu') {
                  <span>▸</span>
                }
              </button>
            }
          }
        }
      </div>
    }
  `,
})
export class EpdfToolbarMenu {
  readonly view = input.required<OverflowMenuView>();
  /** Which way the toolbar runs: the menu opens under its button, or beside a vertical one's. */
  readonly orientation = input<Orientation>('horizontal');

  /**
   * Whether it's open, apart from the view: the toolbar hands a new view on every change, and
   * attaching the keys again would put focus back on the first row.
   */
  protected readonly isOpen = computed(() => this.view().isOpen);
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    afterRenderEffect((onCleanup) => {
      const menu = this.menu()?.nativeElement;
      if (!this.isOpen() || !menu) return;
      onCleanup(untracked(() => this.attach(host, menu)));
    });
  }

  /** Close on a press outside, and take the menu keys; returns the detach. */
  private attach(host: HTMLElement, menu: HTMLElement): () => void {
    // This element is `display: contents`; its parent holds the menu's button too, so a press
    // on the button is the button's own toggle.
    const container = host.parentElement ?? host;
    const trigger = focusablesIn(container).find((candidate) => !menu.contains(candidate)) ?? null;
    const close = () => untracked(this.view).close();
    const stopOutside = observeOutsidePress(container, close);
    const detachKeys = attachMenuKeys(menu, { trigger, close });
    return () => {
      stopOutside();
      detachKeys();
    };
  }

  protected readonly menuStyle = computed(
    () =>
      `position: absolute; ${placementOf(this.orientation())} z-index: 41; min-width: 200px; ` +
      `padding: 4px; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 6px; ` +
      'box-shadow: 0 4px 16px rgba(0,0,0,0.15);',
  );
  protected readonly dividerStyle = `height: 1px; background: ${BORDER}; margin: 4px 0;`;
  protected readonly rowStyle =
    'display: flex; width: 100%; align-items: center; justify-content: space-between; ' +
    'gap: 16px; padding: 6px 8px; border: none; color: inherit; font: inherit; ' +
    'background: transparent; white-space: nowrap;';

  /** Run the row's command; a row that opens a submenu keeps the menu open. */
  protected choose(row: OverflowRow): void {
    const view = this.view();
    view.execute(row.command);
    if (row.type !== 'submenu') view.close();
  }
}

/** The plain folded group: a `<select>` for `collapse: 'select'`, a ⋯ menu button otherwise. */
@Component({
  selector: 'epdf-toolbar-collapsed',
  imports: [EpdfToolbarMoreButton, EpdfToolbarMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
  template: `
    @if (view().collapse === 'select') {
      <select #select [style]="selectStyle" (change)="view().execute(select.value)">
        @if (!activeId()) {
          <option value="" selected disabled hidden></option>
        }
        @for (command of view().commands; track command.id) {
          <option
            [value]="command.id"
            [disabled]="!command.enabled"
            [selected]="command.id === activeId()"
          >
            {{ command.label }}
          </option>
        }
      </select>
    } @else {
      <span style="position: relative; display: inline-flex">
        <epdf-toolbar-more-button [open]="isOpen()" (toggle)="isOpen.set(!isOpen())" />
        <epdf-toolbar-menu [view]="menu()" [orientation]="orientation()" />
      </span>
    }
  `,
})
export class EpdfToolbarCollapsed {
  readonly view = input.required<CollapsedGroupView>();
  /** Which way the toolbar runs: where the menu opens. */
  readonly orientation = input<Orientation>('horizontal');

  protected readonly isOpen = signal(false);
  protected readonly activeId: Signal<string | null> = computed(
    () => this.view().commands.find((command: ResolvedCommand) => command.active)?.id ?? null,
  );
  protected readonly menu = computed(() =>
    groupMenuView(this.view(), this.isOpen(), () => this.isOpen.set(false)),
  );
  protected readonly selectStyle =
    `padding: 4px 6px; font: inherit; border-radius: 4px; border: 1px solid ${BORDER}; ` +
    `background: ${SURFACE};`;
}

/** The plain button of a group that shed items: a chevron opening a menu of them. */
@Component({
  selector: 'epdf-toolbar-group-trigger',
  imports: [EpdfToolbarMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
  template: `
    <span style="position: relative; display: inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        [attr.aria-expanded]="isOpen()"
        title="More"
        [style]="buttonStyle"
        [style.background]="isOpen() || someActive() ? active : 'transparent'"
        (click)="isOpen.set(!isOpen())"
      >
        ▾
      </button>
      <epdf-toolbar-menu [view]="menu()" [orientation]="orientation()" />
    </span>
  `,
})
export class EpdfToolbarGroupTrigger {
  readonly view = input.required<GroupDisclosureView>();
  /** Which way the toolbar runs: where the menu opens. */
  readonly orientation = input<Orientation>('horizontal');

  protected readonly isOpen = signal(false);
  /** A hint that the active item is in here. */
  protected readonly someActive = computed(() =>
    this.view().commands.some((command) => command.active),
  );
  protected readonly menu = computed(() =>
    groupMenuView(this.view(), this.isOpen(), () => this.isOpen.set(false)),
  );
  protected readonly active = ACTIVE;
  protected readonly buttonStyle =
    'display: inline-flex; align-items: center; padding: 4px 6px; color: inherit; ' +
    `font: inherit; border: 1px solid ${BORDER}; border-radius: 4px; cursor: pointer;`;
}
