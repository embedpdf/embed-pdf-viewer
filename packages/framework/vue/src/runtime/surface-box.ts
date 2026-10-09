/**
 * A page surface's boxes (`pageSurfaceLayout` from `@embedpdf/web`) as Vue style values, for
 * the Stage's pages and `<PageView>`: Vue adds no unit to a number, so each is in pixels here.
 */
import type { SurfaceBox } from '@embedpdf/web';

/** `left`, `top`, `width` and `height` in pixels. */
export function pixelBox(box: SurfaceBox): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}
