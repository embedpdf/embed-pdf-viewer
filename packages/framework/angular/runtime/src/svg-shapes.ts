/**
 * Scene shapes as SVG elements: `@embedpdf/web`'s element descriptions (`svgShapesOf`), one
 * element each, a clipping `svg` with its children. The annotation and form layers draw their
 * scenes through `<svg:g [epdfSvgShapes]>` inside an `<svg>`.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
} from '@angular/core';
import { createFontMounts, type SvgShape } from '@embedpdf/web';

/**
 * An SVG element's attributes from a record of SVG names (`stroke-width`), as `@embedpdf/web`
 * describes a scene node (templates can't spread). Set again when the record changes; an
 * attribute that left the record is removed.
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

/** The shapes, in drawing order, in the `<svg:g>` it's on, and the faces their text draws in. */
@Component({
  selector: 'g[epdfSvgShapes]',
  imports: [EpdfSvgAttributes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (shape of shapes(); track $index) {
      @switch (shape.tag) {
        @case ('rect') {
          <svg:rect [epdfSvgAttributes]="shape.attributes" [style]="shape.style ?? null"></svg:rect>
        }
        @case ('ellipse') {
          <svg:ellipse
            [epdfSvgAttributes]="shape.attributes"
            [style]="shape.style ?? null"
          ></svg:ellipse>
        }
        @case ('line') {
          <svg:line [epdfSvgAttributes]="shape.attributes" [style]="shape.style ?? null"></svg:line>
        }
        @case ('path') {
          <svg:path [epdfSvgAttributes]="shape.attributes" [style]="shape.style ?? null"></svg:path>
        }
        @case ('polygon') {
          <svg:polygon
            [epdfSvgAttributes]="shape.attributes"
            [style]="shape.style ?? null"
          ></svg:polygon>
        }
        @case ('polyline') {
          <svg:polyline
            [epdfSvgAttributes]="shape.attributes"
            [style]="shape.style ?? null"
          ></svg:polyline>
        }
        @case ('text') {
          <svg:text
            [epdfSvgAttributes]="shape.attributes"
            [style]="shape.style ?? null"
            [textContent]="shape.text ?? ''"
          ></svg:text>
        }
        @case ('svg') {
          <svg:svg [epdfSvgAttributes]="shape.attributes">
            <svg:g [epdfSvgShapes]="shape.children ?? []"></svg:g>
          </svg:svg>
        }
      }
    }
  `,
})
export class EpdfSvgShapes {
  readonly shapes = input.required<readonly SvgShape[]>({ alias: 'epdfSvgShapes' });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // The faces of this level's text, while it shows: a clipping `svg` mounts its children's.
    const mounts = createFontMounts();
    inject(DestroyRef).onDestroy(() => mounts.release());
    effect(() =>
      mounts.mount(this.shapes().flatMap((shape) => (shape.program ? [shape.program] : []))),
    );
  }
}
