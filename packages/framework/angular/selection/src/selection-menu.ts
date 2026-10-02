/**
 * `<epdf-selection-menu>`: your UI next to the selected text. Put it inside `<epdf-stage>`,
 * next to the page template, with what the menu holds between its tags:
 *
 *   <epdf-stage>
 *     <ng-template epdfPage>…</ng-template>
 *     <epdf-selection-menu placement="bottom">
 *       <button (click)="copy()">Copy</button>
 *     </epdf-selection-menu>
 *   </epdf-stage>
 *
 * It hides while the user drags and appears when the selection settles (a selection made from
 * code shows at once). One menu for the whole selection: it sits by the selection on the page
 * where it ends. It rides `<epdf-anchored>`, so it moves with the pages in the same frame, and a
 * click in it never reaches the page.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { samePageBounds } from '@embedpdf/web';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
} from '@embedpdf/angular/runtime';
import { EpdfAnchored, type AnchoredPlacement } from '@embedpdf/angular/anchored';

@Component({
  selector: 'epdf-selection-menu',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" [placement]="placement()" [gap]="gap()">
      <ng-content />
    </epdf-anchored>
  `,
})
export class EpdfSelectionMenu {
  /** Which side of the selection: `'top'`, `'bottom'`, `'left'` or `'right'`, or a corner. */
  readonly placement = input<AnchoredPlacement>('top');
  /** Screen pixels between the selection and the menu. */
  readonly gap = input(8);

  /** The selection of the document this part of the template talks to. */
  private readonly selection = new CapabilityBinding(
    injectKernelHost('<epdf-selection-menu>'),
    () => SelectionToken,
    injectDocumentScope(),
  );
  private readonly selecting = this.selection.select((selection) => selection.isSelecting(), false);
  // A fresh object on every read: compared by value, so the menu moves only when the selection
  // did.
  private readonly settled = this.selection.select(
    (selection) => selection.getAnchor(),
    null,
    samePageBounds,
  );
  /** Where the menu goes; nothing while a drag is still selecting. */
  protected readonly anchor = computed(() => (this.selecting() ? null : this.settled()));
}
