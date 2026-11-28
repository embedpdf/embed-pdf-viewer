/**
 * Where a mark goes in a field's box, as the engine draws it: fitted whole and centred in the
 * box's frame, and turned with the frame on a turned field. A signature field takes the whole
 * frame (the mark is drawn in place of the field's box); an image field's picture sits inside
 * its border, as a push button's icon does: the border's width in, twice that for a beveled or
 * an inset border. The armed mark's preview over a field is drawn here, so it lands where the
 * fill will.
 */
import type { Box, FormWidgetItem } from '@embedpdf/plugin-form/contract';

/** A mark's box in a field: fitted, centred, before the field's turn, and that turn. */
export interface MarkPlace {
  readonly box: Box;
  /** The field's turn, degrees clockwise about the middle of `box`. */
  readonly rot: number;
}

/** How far in from the frame an image field's picture sits: its border, doubled when shaded. */
function borderInsetOf(look: FormWidgetItem['look']): number {
  const shaded = look.borderStyle === 'beveled' || look.borderStyle === 'inset';
  return Math.max(0, look.borderWidth) * (shaded ? 2 : 1);
}

/**
 * Where a mark of `size` (its width and height, any unit: only the ratio counts) goes in `item`,
 * a signature field's or an image field's box; `null` for a box with no room or a mark of no
 * size.
 */
export function markPlaceIn(
  item: Pick<FormWidgetItem, 'box' | 'rotation' | 'look' | 'control'>,
  size: { readonly width: number; readonly height: number },
): MarkPlace | null {
  const inset = item.control === 'image' ? borderInsetOf(item.look) : 0;
  const room = {
    x: item.box.x + inset,
    y: item.box.y + inset,
    width: item.box.width - 2 * inset,
    height: item.box.height - 2 * inset,
  };
  if (room.width <= 0 || room.height <= 0 || size.width <= 0 || size.height <= 0) return null;
  const scale = Math.min(room.width / size.width, room.height / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    box: {
      x: room.x + (room.width - width) / 2,
      y: room.y + (room.height - height) / 2,
      width,
      height,
    },
    rot: item.rotation,
  };
}
