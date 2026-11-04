/**
 * `<epdf-snapshot-layer>`: the `snapshot` tool's box on one page, while it's dragged and while
 * it's held. It only draws: the tool's handler takes the pointer, and the render plugin decides
 * where the box is, in page space, placed here through the page context. The colors are the
 * plugin's `snapshot.box` setting, the viewer's accent while unset, and the
 * `--epdf-snapshot-box-*` CSS variables win over both. Put it in each page, after the other
 * layers.
 */
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  RENDER_DEFAULTS,
  RenderToken,
  type RenderHostCapability,
} from '@embedpdf/plugin-render/contract/host';
import { rectInPixels, SNAPSHOT_BOX_DASH, snapshotBoxPaint } from '@embedpdf/web';
import { CapabilityBinding, injectKernelHost, injectPage } from '@embedpdf/angular/runtime';

@Component({
  selector: 'epdf-snapshot-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pixels(); as box) {
      <svg
        aria-hidden="true"
        style="position: absolute; overflow: visible; pointer-events: none;"
        [style.left.px]="box.left"
        [style.top.px]="box.top"
        [attr.width]="box.width"
        [attr.height]="box.height"
      >
        <!-- The colors go in style: an SVG attribute doesn't read var(). -->
        <rect
          stroke-width="1"
          [attr.width]="box.width"
          [attr.height]="box.height"
          [attr.stroke-dasharray]="dash"
          [style.fill]="boxStyle().fill"
          [style.stroke]="boxStyle().stroke"
        />
      </svg>
    }
  `,
})
export class EpdfSnapshotLayer {
  private readonly page = injectPage('<epdf-snapshot-layer>');
  private readonly host = injectKernelHost('<epdf-snapshot-layer>');
  /** The render plugin of the page's own document, with what layers need of it. */
  private readonly render = new CapabilityBinding<RenderHostCapability>(
    this.host,
    () => RenderToken,
    () => this.page.documentId,
  );

  /** The box on this page in page space: the same object while it doesn't change. */
  private readonly box = this.render.select((render) => render.getSnapshotBox(this.page.ref), null);
  private readonly colors = this.render.select(
    (render) => render.getSettings().snapshot.box,
    RENDER_DEFAULTS.snapshot.box,
  );

  protected readonly dash = SNAPSHOT_BOX_DASH;
  /** The box in the page's pixels, which turn with the page. */
  protected readonly pixels = computed(() => {
    const box = this.box();
    return box && rectInPixels(box, this.page.transform());
  });
  /** The CSS variables, then the setting, then the accent (with its own variable). */
  protected readonly boxStyle = computed(() =>
    snapshotBoxPaint(this.colors(), this.host.viewerSettings().accent),
  );
}
