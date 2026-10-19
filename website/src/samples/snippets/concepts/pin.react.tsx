import { RenderLayer } from '@embedpdf/react/render';
import { Stage } from '@embedpdf/react/stage';

// Your own data: points in page coordinates, by the page's object number.
const pins = new Map<number, { x: number; y: number }[]>();

export const Pages = () => (
  <Stage>
    {(page) => (
      <>
        <RenderLayer />
        {(pins.get(page.ref.objectNumber) ?? []).map((point, index) => {
          // page coordinates → pixels on this page, at its zoom; the page turns them with it
          const { x, y } = page.transform.toPixels(point);
          return (
            <div key={index} style={{ position: 'absolute', left: x, top: y }}>
              📌
            </div>
          );
        })}
      </>
    )}
  </Stage>
);
