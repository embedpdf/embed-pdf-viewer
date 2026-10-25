/**
 * The notice after its sender updated it: the switch moved an hour earlier, so its row is boxed and
 * a typed text box gives the new time, and a formatted text box stresses who has to act. Two text
 * boxes, one plain and one with bold and coloured words, and a rectangle: what the text box
 * examples edit, format and draw their own way.
 */
import { outset } from '../shared/annotations.mjs';

// A typed note's look: dark text on pale yellow, in a thin amber frame.
const TEXT_BOX = { interiorColor: '#fffbe6', color: '#e9c46a' };

export default async function bake({ edit }) {
  await edit(async ({ doc, place }) => {
    const on = (mark) => doc.page(mark.page).annotations;

    const row = place('switch-row');
    await on(row).create({
      subtype: 'square',
      nm: 'switch-box',
      box: outset(row.rect, 3),
      color: '#e5484d',
      strokeWidth: 2,
    });

    const textBox = place('text-box');
    await on(textBox).create({
      subtype: 'free-text',
      nm: 'text-box',
      box: textBox.rect,
      contents: 'Moved one hour earlier: the switch is now 06:00 to 07:00 UTC.',
      fontSize: 12,
      fontColor: '#1a2748',
      ...TEXT_BOX,
    });

    const richText = place('rich-text');
    await on(richText).create({
      subtype: 'free-text',
      nm: 'rich-text',
      box: richText.rect,
      ...TEXT_BOX,
      richText: {
        body: { family: 'Helvetica', size: 12, color: '#1a2748' },
        paragraphs: [
          {
            runs: [
              { text: 'Action needed', style: { weight: 700 } },
              { text: ' only if you pin a build by its hash: check it after ' },
              { text: '3 November', style: { weight: 700, color: '#c00000' } },
              { text: '.' },
            ],
          },
        ],
      },
    });

    await doc.metadata.update({
      title: 'Planned maintenance of the EmbedPDF CDN',
      author: 'EmbedPDF maintainers',
      subject: 'snippet.embedpdf.com moves to a new CDN on 4 November 2026',
      keywords: 'EmbedPDF, CDN, maintenance, notice',
    });
  });
}
