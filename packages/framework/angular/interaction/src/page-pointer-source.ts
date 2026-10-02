/**
 * `<epdf-page-pointer-source>`: a page's pointer input, for the tools. It covers the page as one
 * transparent element, turns each pointer event into a point on the page (through the page
 * context, so it needs nothing but the page), and hands it to the interaction plugin, whose
 * active tool decides what the press means.
 *
 * You rarely mount it: a Stage takes its pointer input itself, and `<epdf-page-view>` mounts
 * this below its layers when the interaction plugin is registered. It's here for a page surface
 * of your own. Features never listen to the pointer themselves: they register with the
 * interaction plugin.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import {
  InteractionToken as InteractionHostToken,
  type InteractionHostCapability,
} from '@embedpdf/plugin-interaction/contract/host';
import { attachPagePointer } from '@embedpdf/web';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';

/**
 * The page's pointer input, for the active tool. Put it first in the page's content, below the
 * layers: a layer that lets the pointer through (the picture, a highlight) passes presses on to
 * it, and a control that takes its own presses (a link, a form field) keeps them. Shows the
 * cursor the active tool asks for (text over text, a crosshair for a drawing tool).
 */
@Component({
  selector: 'epdf-page-pointer-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'position: absolute; inset: 0; display: block; touch-action: none',
    '[style.cursor]': 'cursor()',
  },
  template: '',
})
export class EpdfPagePointerSource {
  private readonly page = injectPage('<epdf-page-pointer-source>');
  /** The interaction plugin of the page's own document. */
  private readonly interaction = new CapabilityBinding<InteractionHostCapability>(
    injectKernelHost('<epdf-page-pointer-source>'),
    () => InteractionHostToken,
    () => this.page.documentId,
  );
  protected readonly cursor = this.interaction.select(
    (interaction) => interaction.getCursor(),
    'default',
  );

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // The listener is `@embedpdf/web`'s, shared with every framework. It reads the page when an
    // event arrives: a zoom changes its transform, and a drag carries on through it.
    const page = this.page;
    effect((onCleanup) => {
      const interaction = this.interaction.capability();
      if (!interaction) return;
      onCleanup(
        untracked(() =>
          attachPagePointer(element, interaction, () => ({
            ref: page.ref,
            transform: untracked(page.transform),
            toPagePoint: page.toPagePoint,
          })),
        ),
      );
    });
  }
}
