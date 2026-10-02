/**
 * The toolbar's plain parts, for every part the app leaves out: the "More" button, a popover
 * menu, a folded group and a group's shed-items button. They're meant to be replaced, so their
 * colors come from the `--epdf-toolbar-*` CSS variables only.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  type Signal,
} from '@angular/core';
import { groupMenuView, type OverflowRow } from '@embedpdf/core-ui';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import { paintDefault } from '@embedpdf/web';
import type { CollapsedGroupView, GroupDisclosureView, OverflowMenuView } from './templates';

const SURFACE = paintDefault('toolbar-surface');
const BORDER = paintDefault('toolbar-border');
const ACTIVE = paintDefault('toolbar-active');

/** The colors, for the toolbar's own default command button and separator. */
export const TOOLBAR_PAINT = { surface: SURFACE, border: BORDER, active: ACTIVE } as const;

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

/** The plain popover menu: a click outside closes it, a row runs its command. */
@Component({
  selector: 'epdf-toolbar-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents;' },
  template: `
    @if (view().isOpen) {
      <div style="position: fixed; inset: 0; z-index: 40" (click)="view().close()"></div>
      <div role="menu" [style]="menuStyle">
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

  protected readonly menuStyle =
    'position: absolute; right: 0; top: 100%; z-index: 41; min-width: 200px; padding: 4px; ' +
    `background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 6px; ` +
    'box-shadow: 0 4px 16px rgba(0,0,0,0.15);';
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
        <epdf-toolbar-menu [view]="menu()" />
      </span>
    }
  `,
})
export class EpdfToolbarCollapsed {
  readonly view = input.required<CollapsedGroupView>();

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
      <epdf-toolbar-menu [view]="menu()" />
    </span>
  `,
})
export class EpdfToolbarGroupTrigger {
  readonly view = input.required<GroupDisclosureView>();

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
