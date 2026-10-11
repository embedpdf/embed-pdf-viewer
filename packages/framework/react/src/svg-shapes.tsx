/**
 * Scene shapes as React elements: `@embedpdf/web`'s element descriptions
 * (`svgShapesOf`), one element each, a clipping `svg` with its children. The
 * annotation and form layers draw their scenes through it.
 */
import type { SvgShape } from '@embedpdf/web';
import React from 'react';

/** SVG attribute names as React's props: `stroke-width` is `strokeWidth`. */
function reactProps(attributes: Readonly<Record<string, string | number>>) {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

export function svgElements(shapes: readonly SvgShape[]): React.ReactNode[] {
  return shapes.map((shape, index) =>
    React.createElement(
      shape.tag,
      {
        key: index,
        ...reactProps(shape.attributes),
        ...(shape.blend
          ? { style: { mixBlendMode: shape.blend as React.CSSProperties['mixBlendMode'] } }
          : {}),
      },
      shape.children ? svgElements(shape.children) : shape.text,
    ),
  );
}
