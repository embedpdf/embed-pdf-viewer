/**
 * The article as published: running text and nothing marked, so whatever the examples that open
 * it draw or highlight is the reader's own.
 */
import { FERNQUILL } from '../shared/annotations.mjs';

export const company = FERNQUILL;

export default async function bake({ edit }) {
  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'How the first page of a large PDF got three times faster',
      author: 'Fernquill engineering',
      subject: 'Measuring pages on demand and building the search index later',
      keywords: 'Fernquill, performance, engineering, blog',
    });
    for (const [index, title] of ['Where the time went', 'Search can wait'].entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
