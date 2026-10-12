/**
 * `<epdf-selection-clipboard>`: Ctrl+C, Cmd+C and the browser's Copy menu copy the selected
 * text. Put it once next to a document view; it draws nothing.
 *
 * It reads the selected text as soon as a selection settles, so the browser's copy event can be
 * answered at once (it can't wait for a read), and copies with the Clipboard API when there's
 * no page selection for the browser to copy. `[prefetch]="false"` reads the text only when
 * someone copies. A selection the user may not copy isn't copied, and `(refused)` fires. The mechanics are `@embedpdf/web`'s, shared by every framework.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { wireSelectionClipboard } from '@embedpdf/web';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
} from '@embedpdf/angular/runtime';

@Component({
  selector: 'epdf-selection-clipboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class EpdfSelectionClipboard {
  /** Read the selected text when the selection settles (default true). */
  readonly prefetch = input<boolean | undefined>(undefined);
  /** Ctrl+C or the Copy menu met a selection the user may not copy: say so. */
  readonly refused = output<void>();

  private readonly selection = new CapabilityBinding(
    injectKernelHost('<epdf-selection-clipboard>'),
    () => SelectionToken,
    injectDocumentScope(),
  ).capability;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // Wired for the document's selection while there is one; again for the next document.
    effect((onCleanup) => {
      const selection = this.selection();
      const prefetch = this.prefetch();
      if (!selection) return;
      onCleanup(
        wireSelectionClipboard(selection, {
          ...(prefetch === undefined ? {} : { prefetch }),
          onRefused: () => this.refused.emit(),
        }),
      );
    });
  }
}
