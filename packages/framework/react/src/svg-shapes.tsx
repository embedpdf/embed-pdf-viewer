/**
 * Scene shapes as React elements: `@embedpdf/web`'s element descriptions
 * (`svgShapesOf`), one element each, a clipping `svg` with its children, and
 * the faces their text draws in mounted while they show. The annotation and
 * form layers draw their scenes through it.
 */
import { fontProgramsOf, type SvgShape } from '@embedpdf/web';
import React from 'react';

import { useFontMounts } from './font-mounts';

export function SvgShapes({ shapes }: { shapes: readonly SvgShape[] }) {
  useFontMounts(fontProgramsOf(shapes));
  return <>{svgElements(shapes)}</>;
}

/** A hyphenated name as React's: `stroke-width` is `strokeWidth`, `mix-blend-mode` is `mixBlendMode`. */
const camelCase = (name: string) =>
  name.replace(/-([a-z])/g, (_dash, letter: string) => letter.toUpperCase());

/** SVG attribute names as React's props. */
function reactProps(attributes: Readonly<Record<string, string | number>>) {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [camelCase(name), value]),
  );
}

/** CSS names as React's style keys. */
function reactStyle(style: Readonly<Record<string, string>>): React.CSSProperties {
  return Object.fromEntries(
    Object.entries(style).map(([name, value]) => [camelCase(name), value]),
  ) as React.CSSProperties;
}

function svgElements(shapes: readonly SvgShape[]): React.ReactNode[] {
  return shapes.map((shape, index) =>
    React.createElement(
      shape.tag,
      {
        key: index,
        ...reactProps(shape.attributes),
        ...(shape.style ? { style: reactStyle(shape.style) } : {}),
      },
      shape.children ? svgElements(shape.children) : shape.text,
    ),
  );
}
