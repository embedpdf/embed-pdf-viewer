/**
 * `<epdf-snapshot-menu>`: your UI by the snapshot the `snapshot` tool holds. Put it inside
 * `<epdf-stage>`, next to the page template, with what the menu holds between its tags:
 *
 *   <epdf-stage>
 *     <ng-template epdfPage>…</ng-template>
 *     <epdf-snapshot-menu>
 *       <button (click)="copy()">Copy</button>
 *     </epdf-snapshot-menu>
 *   </epdf-stage>
 *
 * It appears once the snapshot is taken, when the pointer lifts, and goes with it. It rides
 * `<epdf-anchored>`, so it moves with the pages in the same frame, and a click in it never
 * reaches the page.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RenderToken } from '@embedpdf/plugin-render';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
} from '@embedpdf/angular/runtime';
import { EpdfAnchored, type AnchoredPlacement } from '@embedpdf/angular/anchored';

@Component({
  selector: 'epdf-snapshot-menu',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" [placement]="placement()" [gap]="gap()">
      <ng-content />
    </epdf-anchored>
  `,
})
export class EpdfSnapshotMenu {
  /** Which side of the box: `'top'`, `'bottom'`, `'left'` or `'right'`, or a corner. */
  readonly placement = input<AnchoredPlacement>('bottom');
  /** Screen pixels between the box and the menu. */
  readonly gap = input(8);

  /** The render plugin of the document this part of the template talks to. */
  private readonly render = new CapabilityBinding(
    injectKernelHost('<epdf-snapshot-menu>'),
    () => RenderToken,
    injectDocumentScope(),
  );
  private readonly snapshot = this.render.select((render) => render.getSnapshot(), null);
  /** Where the menu goes: the snapshot's box on its page; nothing without a snapshot. */
  protected readonly anchor = computed(() => {
    const snapshot = this.snapshot();
    return snapshot && { page: snapshot.page, bounds: snapshot.rect };
  });
}
