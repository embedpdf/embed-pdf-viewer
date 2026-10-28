/**
 * Fernquill's empty floor plan: no annotations, so the examples that open it to draw on show only
 * what the reader draws, and a list of annotations starts empty.
 */
import { FERNQUILL } from '../shared/annotations.mjs';

export const company = FERNQUILL;

export default async function bake({ edit }) {
  await edit(async ({ doc }) => {
    await doc.metadata.update({
      title: 'Studio floor plan',
      author: 'Fernquill Ltd',
      subject: 'The second floor of the studio, empty, for planning the move',
      keywords: 'Fernquill, floor plan, office',
    });
  });
}
