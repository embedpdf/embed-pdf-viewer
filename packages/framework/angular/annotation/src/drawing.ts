/**
 * How the layer draws one annotation, the parts its template is built from:
 *
 *   [epdfAnnotationFrame]      the box an annotation draws into, placed and turned like it
 *   <epdf-annotation-native>   its own drawing in that box: the engine's picture or its scene
 *
 * No bounds math and no per-kind logic: the core computes each item's frame, box and scene,
 * and `@embedpdf/web` turns them into pixels and SVG elements, the same for every framework.
 */
import { ChangeDetectionStrategy, Component, computed, Directive, input } from '@angular/core';
import { EpdfSvgShapes, injectPage } from '@embedpdf/angular/runtime';
import { MITER_LIMIT, scene, type RenderItem } from '@embedpdf/core-annotation';
import {
  frameInPixels,
  ghostOpacity,
  previewZIndexOf,
  rasterInFrame,
  recordAccentStyleOf,
  recordOutlineStyleOf,
  recordPlaceholderStyleOf,
  sceneViewBox,
  svgShapesOf,
  type FramePixels,
  type PictureOrPainting,
} from '@embedpdf/web';
import { pagePixelsOf } from './page-reads';
import { injectChromeSettings } from './settings';

/**
 * The box an annotation draws into, in the page layer: placed, sized and turned like the
 * annotation (`item.frame`), inside the page layer that the page itself turns. Its blend is on
 * the box: a turned box groups what is in it, so blending an element inside would stop
 * blending with the page. It takes the pointer only for a look that does (`interactive`), and
 * `inert` keeps the pointer and the focus out of a look that only draws. A preview and a drawing
 * in progress (`frameSource` `ghost` or `draft`) rise above the form's fields.
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
    '[style.z-index]': 'zIndex() ?? null',
  },
})
export class EpdfAnnotationFrame {
  readonly frame = input.required<FramePixels>({ alias: 'epdfAnnotationFrame' });
  readonly blend = input<string | undefined>(undefined, { alias: 'frameBlend' });
  readonly interactive = input(false, { alias: 'frameInteractive' });
  readonly inert = input(false, { alias: 'frameInert' });
  /** How the item paints (`RenderItem.source`): a preview or a drawing in progress rises. */
  readonly source = input<string | undefined>(undefined, { alias: 'frameSource' });
  protected readonly zIndex = computed(() => {
    const source = this.source();
    return source === undefined ? undefined : previewZIndexOf(source);
  });
}

/**
 * The scene, filling the item's frame: drawn upright in it, the frame turns it. Nothing until
 * the item has area (the 0×0 drawing at a press). The SVG and its viewBox stay proportional:
 * never clamp either one.
 */
@Component({
  selector: 'epdf-annotation-scene',
  imports: [EpdfSvgShapes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (viewBox(); as viewBox) {
      <svg
        style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none"
        [attr.viewBox]="viewBox"
        [style.opacity]="opacity()"
      >
        <svg:g [epdfSvgShapes]="shapes()"></svg:g>
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
 * (following a move as it happens), or its scene, as the layer's one rule picks (`shows`,
 * `pictureOrPainting`). A lent record's accent (a form field's tint) fills the frame above it,
 * or its outline edges it, and its placeholder (what an empty field is for) is written over both.
 * A tool's ghost carries them too, see-through as its drawing is.
 */
@Component({
  selector: 'epdf-annotation-native',
  imports: [EpdfAnnotationScene],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (shows()?.kind === 'painting') {
      <epdf-annotation-scene [item]="item()" />
    } @else if (picture() && raster(); as box) {
      <!-- An explicit size, never clamped by a global img reset (a landscape stamp on a
           turned page is wider than its containing block); the turn the engine took out
           of the picture goes back on about its middle. -->
      <img
        alt=""
        draggable="false"
        style="position: absolute; max-width: none; max-height: none; pointer-events: none; transform-origin: center"
        [attr.src]="picture()"
        [style.left]="box.left"
        [style.top]="box.top"
        [style.width]="box.width"
        [style.height]="box.height"
        [style.transform]="box.transform ?? null"
      />
    }
    @if (accent(); as accentStyle) {
      <div [style]="accentStyle"></div>
    }
    @if (outline(); as outlineStyle) {
      <div data-epdf-outline="" [style]="outlineStyle"></div>
    }
    @if (placeholder(); as placeholder) {
      <span aria-hidden="true" data-epdf-placeholder="" [style]="placeholder.style">{{
        placeholder.text
      }}</span>
    }
  `,
})
export class EpdfAnnotationNative {
  readonly item = input.required<RenderItem>();
  /** What it shows: the engine's picture, its scene, or nothing yet. */
  readonly shows = input<PictureOrPainting<RenderItem>>(null);

  protected readonly picture = computed(() => {
    const shows = this.shows();
    return shows?.kind === 'picture' ? shows.picture.url : null;
  });
  protected readonly raster = computed(() => {
    const item = this.item();
    return item.raster ? rasterInFrame(item.raster, item.frame) : null;
  });
  /** A ghost's paint is see-through, as its drawing is. */
  private readonly seeThrough = computed(() => {
    const item = this.item();
    return item.source === 'ghost' ? { opacity: ghostOpacity(item.ghostOpacity ?? 0.5) } : null;
  });
  protected readonly accent = computed(() => {
    const { accent } = this.item();
    return accent ? { ...recordAccentStyleOf(accent), ...this.seeThrough() } : null;
  });
  /** A lent field's outline is the form's edge, which follows the viewer's accent. */
  private readonly viewer = injectChromeSettings();
  protected readonly outline = computed(() => {
    const { outline } = this.item();
    return outline
      ? { ...recordOutlineStyleOf(outline, this.viewer.accent()), ...this.seeThrough() }
      : null;
  });

  /** The page's transform, for the size the placeholder's words are written at. */
  private readonly pixels = pagePixelsOf(injectPage('<epdf-annotation-layer>'));
  /** The words a lent record shows while it holds nothing, in the record's own text size. */
  protected readonly placeholder = computed(() => {
    const { placeholder, annotation, text, frame } = this.item();
    if (!placeholder) return null;
    return {
      text: placeholder.text,
      style: {
        ...recordPlaceholderStyleOf(
          placeholder,
          // A ghost has no record yet: its text style is the field's to be.
          (annotation ?? text ?? null) as {
            fontSize?: number | null;
            textAlign?: string | null;
          } | null,
          frame.box,
          frameInPixels(frame, this.pixels()),
        ),
        ...this.seeThrough(),
      },
    };
  });
}
