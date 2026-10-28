/**
 * Fernquill's website wireframes, as Dana Smith marked up the home page in a design review: a box
 * around the product image, a circle around the main button, an arrow that moves a card, three
 * overlapping frames where the screenshots go, a section crossed out and one outlined. Only
 * shapes: the examples that open this document select, move, restyle and stack them.
 */
import { DANA, FERNQUILL, inset, outset } from '../shared/annotations.mjs';

export const company = FERNQUILL;

// The three screenshot frames, back to front: red, green, blue.
const STACK = [
  { color: '#e5484d', interiorColor: '#ffd1d3' },
  { color: '#30a46c', interiorColor: '#c9f0da' },
  { color: '#1e90ff', interiorColor: '#cfe6ff' },
];

export default async function bake({ edit }) {
  await edit(DANA, async ({ doc, place }) => {
    const on = (mark) => doc.page(mark.page).annotations;

    const square = place('square');
    await on(square).create({
      subtype: 'square',
      nm: 'square',
      box: outset(square.rect, 6),
      color: '#e5484d',
      strokeWidth: 3,
    });

    const circle = place('circle');
    await on(circle).create({
      subtype: 'circle',
      nm: 'circle',
      box: outset(circle.rect, 10),
      color: '#1e90ff',
      strokeWidth: 3,
    });

    // From the second card into the empty slot next to it.
    const slot = place('arrow');
    await on(slot).create({
      subtype: 'line',
      nm: 'arrow',
      linePoints: {
        start: { x: slot.rect.x - 46, y: slot.rect.y + slot.rect.height - 20 },
        end: { x: slot.rect.x + 26, y: slot.rect.y + slot.rect.height / 2 + 4 },
      },
      lineEndings: { start: 'none', end: 'closed-arrow' },
      color: '#1a2748',
      strokeWidth: 3,
    });

    // Each frame a step down and to the right of the one before.
    const stack = inset(place('stack').rect, 12);
    const frame = { width: stack.width * 0.5, height: stack.height * 0.62 };
    for (const [index, colors] of STACK.entries()) {
      await on(place('stack')).create({
        subtype: 'square',
        nm: `stack-${index + 1}`,
        box: {
          x: stack.x + index * stack.width * 0.25,
          y: stack.y + index * stack.height * 0.19,
          ...frame,
        },
        ...colors,
        strokeWidth: 3,
      });
    }

    // The newsletter section, crossed out with a zigzag.
    const ink = inset(place('ink').rect, 10);
    const zigzag = Array.from({ length: 41 }, (_, step) => {
      const along = step / 40;
      const turn = (along * 7) % 2; // seven strokes, down and up
      return {
        x: ink.x + ink.width * along,
        y: ink.y + ink.height * (turn < 1 ? turn : 2 - turn),
      };
    });
    await on(place('ink')).create({
      subtype: 'ink',
      nm: 'ink',
      inkList: [zigzag],
      color: '#e5484d',
      strokeWidth: 2.5,
    });

    // The testimonials, outlined by hand: six corners around the section.
    const testimonials = place('polygon').rect;
    const { x, y, width, height } = testimonials;
    await on(place('polygon')).create({
      subtype: 'polygon',
      nm: 'polygon',
      vertices: [
        { x: x - 8, y: y + height * 0.35 },
        { x: x + width * 0.22, y: y - 9 },
        { x: x + width * 0.8, y: y - 6 },
        { x: x + width + 3, y: y + height * 0.5 },
        { x: x + width * 0.72, y: y + height + 9 },
        { x: x + width * 0.12, y: y + height + 6 },
      ],
      color: '#7c3aed',
      strokeWidth: 2.5,
    });
  });

  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Website redesign: wireframes',
      author: 'Dana Smith',
      subject: 'Wireframes of the new home, pricing and documentation pages, with review marks',
      keywords: 'Fernquill, website, wireframes, design review',
    });
    for (const [index, title] of ['Home', 'Pricing', 'Documentation'].entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
