/**
 * How the layer draws one annotation, the parts its template is built from:
 *
 *   [epdfAnnotationFrame]      the box an annotation draws into, placed and turned like it
 *   <epdf-annotation-native>   its own drawing in that box: the engine's picture or its scene
 *   [epdfSvgAttributes]        an SVG element's attributes from a record (templates can't spread)
 *
 * No bounds math and no per-kind logic: the core computes each item's frame, box and scene,
 * and `@embedpdf/web` turns them into pixels and SVG elements, the same for every framework.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { MITER_LIMIT, scene, type RenderItem } from '@embedpdf/core-annotation';
import {
  ghostOpacity,
  rasterInFrame,
  sceneViewBox,
  svgShapesOf,
  type FramePixels,
} from '@embedpdf/web';

/**
 * The box an annotation draws into, in the page layer: placed, sized and turned like the
 * annotation (`item.frame`), inside the page layer that the page itself turns. Its blend is on
 * the box: a turned box groups what is in it, so blending an element inside would stop
 * blending with the page. It takes the pointer only for a look that does (`interactive`), and
 * `inert` keeps the pointer and the focus out of a look that only draws.
 */
@Directive({
  selector: '[epdfAnnotationFrame]',
  host: {
    style: 'position: absolute; transform-origin: center',
    '[style.left.px]': 'frame().left',
    '[style.top.px]': 'frame().top',
    '[style.width.px]': 'frame().width',
    '[style.height.px]': 'frame().height',
    '[style.transform]': 'frame().transform ?? null',
    '[style.mix-blend-mode]': 'blend() ?? null',
    // An interactive look takes the pointer: the layer's own `none` ends here.
    '[style.pointer-events]': "interactive() ? 'auto' : 'none'",
    '[attr.inert]': "inert() ? '' : null",
  },
})
export class EpdfAnnotationFrame {
  readonly frame = input.required<FramePixels>({ alias: 'epdfAnnotationFrame' });
  readonly blend = input<string | undefined>(undefined, { alias: 'frameBlend' });
  readonly interactive = input(false, { alias: 'frameInteractive' });
  readonly inert = input(false, { alias: 'frameInert' });
}

/**
 * An SVG element's attributes from a record of SVG names (`stroke-width`), as `@embedpdf/web`
 * describes a scene node. Set again when the record changes; an attribute that left the record
 * is removed.
 */
@Directive({ selector: '[epdfSvgAttributes]' })
export class EpdfSvgAttributes {
  readonly attributes = input.required<Readonly<Record<string, string | number>>>({
    alias: 'epdfSvgAttributes',
  });

  constructor() {
    const element = inject<ElementRef<SVGElement>>(ElementRef).nativeElement;
    let shown: Readonly<Record<string, string | number>> = {};
    effect(() => {
      const next = this.attributes();
      for (const name of Object.keys(shown)) {
        if (!(name in next)) element.removeAttribute(name);
      }
      for (const [name, value] of Object.entries(next)) {
        if (shown[name] !== value) element.setAttribute(name, String(value));
      }
      shown = next;
    });
  }
}

/**
 * The scene, filling the item's frame: drawn upright in it, the frame turns it. Nothing until
 * the item has area (the 0×0 drawing at a press). The SVG and its viewBox stay proportional:
 * never clamp either one.
 */
@Component({
  selector: 'epdf-annotation-scene',
  imports: [EpdfSvgAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (viewBox(); as viewBox) {
      <svg
        style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none"
        [attr.viewBox]="viewBox"
        [style.opacity]="opacity()"
      >
        @for (shape of shapes(); track $index) {
          @switch (shape.tag) {
            @case ('rect') {
              <svg:rect [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:rect>
            }
            @case ('ellipse') {
              <svg:ellipse [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:ellipse>
            }
            @case ('line') {
              <svg:line [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:line>
            }
            @case ('path') {
              <svg:path [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:path>
            }
            @case ('polygon') {
              <svg:polygon [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:polygon>
            }
            @case ('polyline') {
              <svg:polyline [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null"></svg:polyline>
            }
            @case ('text') {
              <svg:text [epdfSvgAttributes]="shape.attributes" [style.mix-blend-mode]="shape.blend ?? null">{{ shape.text }}</svg:text>
            }
          }
        }
      </svg>
    }
  `,
})
export class EpdfAnnotationScene {
  readonly item = input.required<RenderItem>();

  protected readonly viewBox = computed(() => sceneViewBox(this.item().box));
  protected readonly shapes = computed(() =>
    svgShapesOf(scene(this.item()), { miterLimit: MITER_LIMIT }),
  );
  /** A ghost is see-through as a whole, so its fill and stroke don't stack. */
  protected readonly opacity = computed(() => {
    const item = this.item();
    return item.source === 'ghost' ? ghostOpacity(item.ghostOpacity ?? 0.5) : null;
  });
}

/**
 * An annotation's own drawing, filling its frame: the engine's picture where the core places it
 * (following a move as it happens), or its scene.
 */
@Component({
  selector: 'epdf-annotation-native',
  imports: [EpdfAnnotationScene],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (item().source === 'baked') {
      @if (url() && raster(); as box) {
        <!-- An explicit size, never clamped by a global img reset (a landscape stamp on a
             turned page is wider than its containing block); the turn the engine took out
             of the picture goes back on about its middle. -->
        <img
          alt=""
          draggable="false"
          style="position: absolute; max-width: none; max-height: none; pointer-events: none; transform-origin: center"
          [attr.src]="url()"
          [style.left]="box.left"
          [style.top]="box.top"
          [style.width]="box.width"
          [style.height]="box.height"
          [style.transform]="box.transform ?? null"
        />
      }
    } @else {
      <epdf-annotation-scene [item]="item()" />
    }
  `,
})
export class EpdfAnnotationNative {
  readonly item = input.required<RenderItem>();
  /** The engine's picture of it, once loaded. */
  readonly url = input<string | null>(null);

  protected readonly raster = computed(() => {
    const item = this.item();
    return item.raster ? rasterInFrame(item.raster, item.frame) : null;
  });
}
