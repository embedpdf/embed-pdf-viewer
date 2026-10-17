/**
 * A PDF list box as a visible native `<select>`. A list needs one owner for its pixels, its
 * hit-testing and its scrolling: a baked PDF picture under an invisible select can't give that,
 * because the browser and the PDF would each keep their own top row. So the select is the list,
 * and it's never made again while the field is shown: its scroll position is the user's.
 *
 * A choice shows at once while its write is on its way, and the engine's selection again if
 * the write fails (`@embedpdf/web`'s `createOptimisticSelection`). The wheel stays in the list,
 * so it scrolls instead of the Stage below panning or zooming.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { createOptimisticSelection, isolateWheel, showSelectedOptions } from '@embedpdf/web';

/** One row of a list box. */
export interface FormListBoxOption {
  label: string;
  value: string;
}

@Component({
  selector: 'select[epdfFormListBox]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-label]': 'label()',
    '[multiple]': 'multi()',
    '[attr.size]': 'size()',
    '[disabled]': 'disabled()',
    '(change)': 'choose()',
  },
  template: `
    @for (option of options(); track $index) {
      <option [value]="option.value">{{ option.label }}</option>
    }
  `,
})
export class FormListBox {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Whether several rows can be selected. */
  readonly multi = input(false);
  readonly options = input.required<readonly FormListBoxOption[]>();
  /** The selection the engine has. */
  readonly selected = input.required<readonly string[]>();
  /** Writes a choice; a promise that rejects puts the engine's selection back. */
  readonly write = input.required<(values: string[]) => void | Promise<unknown> | undefined>();

  private readonly element = inject<ElementRef<HTMLSelectElement>>(ElementRef).nativeElement;

  /** Every row shows at least two, so a list never looks like a dropdown. */
  protected readonly size = computed(() => Math.max(2, this.options().length));

  /**
   * The optimistic selection, made at the first read (inputs are there by then) from the
   * engine's selection. It reads no signal, so it's made once.
   */
  private readonly selection = computed(() =>
    createOptimisticSelection(untracked(this.selected)),
  );
  /** Goes up whenever the selection shows something new. */
  private readonly changes = signal(0);
  /** The selection the list shows. */
  private readonly shown = computed(() => {
    this.changes();
    return this.selection().get();
  });

  constructor() {
    effect((onCleanup) => {
      const selection = this.selection();
      onCleanup(selection.subscribe(() => this.changes.update((count) => count + 1)));
    });
    effect(() => {
      const selected = this.selected();
      untracked(() => this.selection().setConfirmed(selected));
    });
    // The rows' selected state is written after each render, not bound: a choice that is
    // refused before the next render leaves the shown selection as it was, and a binding that
    // didn't change would leave the user's row selected.
    afterRenderEffect({
      write: () => {
        const shown = this.shown();
        this.options();
        showSelectedOptions(this.element, shown);
      },
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      inject(DestroyRef).onDestroy(isolateWheel(this.element));
    }
  }

  protected choose(): void {
    const values = Array.from(this.element.selectedOptions, (option) => option.value);
    this.selection().choose(values, (chosen) => this.write()(chosen) ?? undefined);
  }
}
