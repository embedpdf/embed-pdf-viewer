/**
 * The note and file-attachment icons the viewer draws live (src/icons.ts):
 * the engine's drawings, filling the annotation's box.
 */
import { describe, expect, it } from 'vitest';

import { contrastOf, fileAttachmentIconScene, noteIconScene } from '../src/icons';
import { scene } from '../src/scene';
import type { RenderItem, SceneNode, Style } from '../src/types';
import { placed } from '../src/frame';

const BOX = { x: 100, y: 200, width: 20, height: 20 };

const STYLE: Style = {
  color: '#ffff00',
  interiorColor: null,
  strokeWidth: 1,
  opacity: 1,
  blendMode: 'normal',
  borderStyle: 'solid',
  dashArray: null,
  cloudyIntensity: null,
};

const NOTE_ICONS = [
  'comment',
  'key',
  'note',
  'help',
  'new-paragraph',
  'paragraph',
  'insert',
] as const;
const FILE_ICONS = ['push-pin', 'paperclip', 'graph', 'tag'] as const;

/** Every coordinate in a node's path. */
const pointsOf = (node: SceneNode): { x: number; y: number }[] => {
  if (node.kind !== 'path') return [];
  const numbers = node.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2)
    points.push({ x: numbers[i]!, y: numbers[i + 1]! });
  return points;
};

const inside = (nodes: SceneNode[], box = BOX) =>
  nodes
    .flatMap(pointsOf)
    .every(
      (point) =>
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height,
    );

describe('icons', () => {
  it.each(NOTE_ICONS)('the %s note icon is drawn inside its box', (icon) => {
    const nodes = noteIconScene(icon, BOX, STYLE);
    expect(nodes.length).toBeGreaterThan(0);
    expect(inside(nodes)).toBe(true);
  });

  it.each(FILE_ICONS)('the %s attachment icon is drawn inside its box', (icon) => {
    const nodes = fileAttachmentIconScene(icon, BOX, STYLE);
    expect(nodes.length).toBeGreaterThan(0);
    expect(inside(nodes)).toBe(true);
  });

  it('with no icon named, a note is the note icon and an attachment the push pin', () => {
    expect(noteIconScene(undefined, BOX, STYLE)).toEqual(noteIconScene('note', BOX, STYLE));
    expect(fileAttachmentIconScene(undefined, BOX, STYLE)).toEqual(
      fileAttachmentIconScene('push-pin', BOX, STYLE),
    );
  });

  it('the colour fills the body; the outline reads on it', () => {
    const [body] = noteIconScene('comment', BOX, STYLE);
    expect(body!.paint).toMatchObject({ fill: '#ffff00', stroke: '#000000', width: 1 });
    const [dark] = noteIconScene('comment', BOX, { ...STYLE, color: '#1a1a80' });
    expect(dark!.paint.stroke).toBe('#ffffff');
  });

  it('holes are punched even-odd, as the engine paints them', () => {
    expect(noteIconScene('key', BOX, STYLE)[0]!.paint.fillRule).toBe('evenodd');
    expect(noteIconScene('paragraph', BOX, STYLE)[0]!.paint.fillRule).toBeUndefined();
  });

  it('an icon stretches onto its box, and its pen with it', () => {
    const big = { x: 0, y: 0, width: 40, height: 40 };
    const nodes = noteIconScene('note', big, STYLE);
    expect(inside(nodes, big)).toBe(true);
    expect(nodes[0]!.paint.width).toBe(2);
  });

  it('black on light colours, white on dark ones', () => {
    expect(contrastOf('#ffff00')).toBe('#000000');
    expect(contrastOf('#000080')).toBe('#ffffff');
    expect(contrastOf(null)).toBe('#ffffff');
  });

  it("a note's live drawing is its icon", () => {
    const item: RenderItem = placed({
      id: 'obj:1',
      ref: null,
      subtype: 'text',
      geometry: { kind: 'box', box: BOX, rotation: 0, ellipse: false },
      box: BOX,
      style: STYLE,
      icon: 'help',
      source: 'vector',
      selected: false,
    });
    expect(scene(item)).toEqual(noteIconScene('help', BOX, STYLE));
  });
});
