/**
 * Fernquill's quarterly report, as Dana Smith marked it up while reading: a highlight and an
 * underline in the text, a box around one row of the table, a loop around a number, and a typed
 * note. No comments: the examples that open this report have no way to read them.
 */
import { DANA, FERNQUILL, loopAround, markText, outset } from '../shared/annotations.mjs';

export const company = FERNQUILL;

export default async function bake({ edit }) {
  await edit(DANA, async ({ doc, place }) => {
    await markText(doc, 'Fernquill grew faster this quarter than in any quarter before.', {
      subtype: 'highlight',
      nm: 'report-highlight',
      color: '#ffcd45',
    });
    await markText(doc, 'the form designer turns any page into a form', {
      subtype: 'underline',
      nm: 'report-underline',
      color: '#30a46c',
    });

    const row = place('downloads-row');
    await doc.page(row.page).annotations.create({
      subtype: 'square',
      nm: 'report-box',
      box: outset(row.rect, 3),
      color: '#e5484d',
      strokeWidth: 2,
    });

    const contributors = place('contributors');
    await doc.page(contributors.page).annotations.create({
      subtype: 'ink',
      nm: 'report-ink',
      inkList: [loopAround(contributors.rect)],
      color: '#1e6ff0',
      strokeWidth: 2,
    });

    const textBox = place('text-box');
    await doc.page(textBox.page).annotations.create({
      subtype: 'free-text',
      nm: 'report-text-box',
      box: textBox.rect,
      contents: 'Documents opened up 40% since June',
      fontSize: 12,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
      color: '#e9c46a',
    });
  });

  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Q3 2026 report',
      author: 'Fernquill Ltd',
      subject: 'How Fernquill grew in the third quarter of 2026, and what ships next',
      keywords: 'Fernquill, quarterly report, 2026',
    });
    for (const [index, title] of ['Key numbers', "What's next"].entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
