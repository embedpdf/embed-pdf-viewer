/**
 * The selection's chrome on one page: its outline, handles and rotation handle, the guides of a
 * snapped move or a turn, and the box dragged to select. The plugin lists the chrome in page
 * points, already sized for the page's zoom; `@embedpdf/web` puts it in the layer's pixels and
 * paints it from the `chrome` settings, each color, width and dash behind its
 * `--epdf-annotation-*` variable. This component only draws: the viewer decides where a handle
 * can be grabbed, so handles drawn by the app's templates can't break dragging.
 *
 * Paint goes in `style`: an SVG attribute doesn't read `var()`.
 */
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, type TemplateRef } from '@angular/core';
import { injectPage } from '@embedpdf/angular/runtime';
import type { ChromeNode } from '@embedpdf/core-annotation';
import type { ChromeSettings } from '@embedpdf/plugin-annotation';
import { annotationChromePaint, chromeInPixels, type ChromeInPixels } from '@embedpdf/web';
import type {
  EpdfHandleTemplateContext,
  EpdfRotationHandleTemplateContext,
  HandleProps,
  RotationHandleProps,
} from './templates';
import { annotationHostOf, pagePixelsOf } from './page-reads';
import { injectChromeSettings } from './settings';

const NO_NODES: readonly ChromeNode[] = Object.freeze([]);

/** A chrome node, with what a template of the app's draws for it when it's a handle. */
type ChromeView = ChromeInPixels & {
  /** The props for the app's handle template, when it has one for this node. */
  readonly custom?: HandleProps | RotationHandleProps;
};

@Component({
  selector: 'epdf-annotation-chrome',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <svg style="position: absolute; inset: 0; overflow: visible; pointer-events: none">
      @for (node of nodes(); track $index) {
        @switch (node.kind) {
          @case ('handle') {
            @if (node.kind === 'handle' && !node.custom) {
              @if (chrome().handles.shape === 'circle') {
                <svg:circle
                  [attr.cx]="node.at.x"
                  [attr.cy]="node.at.y"
                  [attr.r]="chrome().handles.size / 2"
                  stroke-width="1.5"
                  [style.fill]="paint().handle.fill"
                  [style.stroke]="paint().handle.stroke"
                ></svg:circle>
              } @else {
                <!-- The square rides a turned box: it spins about itself. -->
                <svg:rect
                  [attr.x]="node.at.x - chrome().handles.size / 2"
                  [attr.y]="node.at.y - chrome().handles.size / 2"
                  [attr.width]="chrome().handles.size"
                  [attr.height]="chrome().handles.size"
                  [attr.transform]="
                    node.rotation ? 'rotate(' + node.rotation + ' ' + node.at.x + ' ' + node.at.y + ')' : null
                  "
                  stroke-width="1.5"
                  [style.fill]="paint().handle.fill"
                  [style.stroke]="paint().handle.stroke"
                ></svg:rect>
              }
            }
          }
          @case ('guide') {
            @if (node.kind === 'guide') {
              <svg:line
                [attr.x1]="node.from.x"
                [attr.y1]="node.from.y"
                [attr.x2]="node.to.x"
                [attr.y2]="node.to.y"
                shape-rendering="crispEdges"
                [style.stroke]="paint().guide.stroke"
                [style.stroke-width]="paint().guide.strokeWidth"
                [style.stroke-dasharray]="paint().guide.strokeDasharray"
              ></svg:line>
            }
          }
          @case ('turned-outline') {
            @if (node.kind === 'turned-outline') {
              <svg:polygon
                [attr.points]="node.points"
                fill="none"
                [style.stroke]="paint().outline.stroke"
                [style.stroke-width]="paint().outline.strokeWidth"
                [style.stroke-dasharray]="paint().outline.strokeDasharray"
              ></svg:polygon>
            }
          }
          @case ('rotation-guides') {
            @if (node.kind === 'rotation-guides') {
              <svg:g>
                @for (line of node.lines; track $index) {
                  <svg:line
                    [attr.x1]="line.from.x"
                    [attr.y1]="line.from.y"
                    [attr.x2]="line.to.x"
                    [attr.y2]="line.to.y"
                    [attr.opacity]="line.opacity"
                    [style.stroke]="paint().rotationGuide.stroke"
                    [style.stroke-width]="paint().rotationGuide.strokeWidth"
                    [style.stroke-dasharray]="paint().rotationGuide.strokeDasharray"
                  ></svg:line>
                }
              </svg:g>
            }
          }
          @case ('rotation-handle') {
            @if (node.kind === 'rotation-handle' && !node.custom) {
              <svg:g>
                @if (chrome().rotationHandle.stalk) {
                  <svg:line
                    [attr.x1]="node.from.x"
                    [attr.y1]="node.from.y"
                    [attr.x2]="node.at.x"
                    [attr.y2]="node.at.y"
                    stroke-width="1"
                    [style.stroke]="paint().rotationHandle.stroke"
                  ></svg:line>
                }
                <svg:circle
                  [attr.cx]="node.at.x"
                  [attr.cy]="node.at.y"
                  [attr.r]="chrome().rotationHandle.size / 2"
                  stroke-width="1.5"
                  [style.fill]="paint().rotationHandle.fill"
                  [style.stroke]="paint().rotationHandle.stroke"
                ></svg:circle>
              </svg:g>
            }
          }
          <!-- The box dragged to select keeps its own look (a see-through accent fill, always
               dashed); the selection outline follows the settings. -->
          @case ('marquee') {
            @if (node.kind === 'marquee') {
              <svg:rect
                [attr.x]="node.box.left"
                [attr.y]="node.box.top"
                [attr.width]="node.box.width"
                [attr.height]="node.box.height"
                stroke-width="1"
                stroke-dasharray="4 3"
                [style.fill]="paint().marquee.fill"
                [style.stroke]="paint().marquee.stroke"
              ></svg:rect>
            }
          }
          @case ('outline') {
            @if (node.kind === 'outline') {
              <svg:rect
                [attr.x]="node.box.left"
                [attr.y]="node.box.top"
                [attr.width]="node.box.width"
                [attr.height]="node.box.height"
                fill="none"
                [style.stroke]="paint().outline.stroke"
                [style.stroke-width]="paint().outline.strokeWidth"
                [style.stroke-dasharray]="paint().outline.strokeDasharray"
              ></svg:rect>
            }
          }
        }
      }
    </svg>
    <!-- The app's own handles draw as HTML over the page; the layer's as SVG. -->
    @if (hasCustom()) {
      <div style="position: absolute; inset: 0; pointer-events: none">
        @for (node of nodes(); track $index) {
          @if (node.custom; as props) {
            @if (node.kind === 'handle') {
              <ng-container
                [ngTemplateOutlet]="handle()"
                [ngTemplateOutletContext]="{ $implicit: props }"
              />
            } @else {
              <ng-container
                [ngTemplateOutlet]="rotationHandle()"
                [ngTemplateOutletContext]="{ $implicit: props }"
              />
            }
          }
        }
      </div>
    }
  `,
})
export class EpdfAnnotationChrome {
  /** The app's handle template, drawn in place of the layer's handles. */
  readonly handle = input<TemplateRef<EpdfHandleTemplateContext> | null>(null);
  /** The app's rotation handle template, drawn in place of the layer's. */
  readonly rotationHandle = input<TemplateRef<EpdfRotationHandleTemplateContext> | null>(null);

  private readonly page = injectPage('<epdf-annotation-layer>');
  private readonly annotation = annotationHostOf(this.page, '<epdf-annotation-layer>');
  private readonly pixels = pagePixelsOf(this.page);
  private readonly settings = injectChromeSettings();

  protected readonly chrome = computed((): ChromeSettings => this.settings.chrome());
  protected readonly paint = computed(() =>
    annotationChromePaint(this.settings.chrome(), this.settings.accent()),
  );

  // The page's view scale turns the screen-pixel chrome settings into page units inside the
  // plugin (the rotation handle's offset, the grab zones): the same size on screen at every
  // zoom. What it lists comes back in page points; `chromeInPixels` places it.
  private readonly listed = this.annotation.select((annotation) => {
    const transform = this.pixels();
    return annotation.listChromeNodes(
      this.page.ref,
      transform.viewScale,
      transform.rotation,
      transform.zoom,
    );
  }, NO_NODES);

  protected readonly nodes = computed((): readonly ChromeView[] => {
    const handle = this.handle();
    const rotationHandle = this.rotationHandle();
    const chrome = this.settings.chrome();
    return chromeInPixels(this.listed(), this.pixels()).map((node): ChromeView => {
      if (node.kind === 'handle' && handle) {
        const custom: HandleProps = {
          at: node.at,
          size: chrome.handles.size,
          rotation: node.rotation,
          kind: node.role,
          active: node.active,
        };
        return { ...node, custom };
      }
      if (node.kind === 'rotation-handle' && rotationHandle) {
        // A drawn rotation handle doesn't turn, and isn't told when it's dragged.
        const custom: RotationHandleProps = {
          at: node.at,
          from: node.from,
          size: chrome.rotationHandle.size,
          rotation: 0,
          active: false,
        };
        return { ...node, custom };
      }
      return node;
    });
  });

  protected readonly hasCustom = computed(() => this.nodes().some((node) => node.custom));
}
