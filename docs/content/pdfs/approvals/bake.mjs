/**
 * The approval sheet as it went round: Ada Lovelace attached the provider's quote, and Dana Smith
 * approved both requests with the standard Approved stamp and marked the figures as checked with
 * a red frame and a word. The stamp examples sign the stamps off, place more, and turn the frame
 * and the word into one stamp; page 2 has an empty column to stamp.
 */
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { ADA, DANA, FERNQUILL } from '../shared/annotations.mjs';

export const company = FERNQUILL;

const QUOTE = `Quote Q-2026-1187: CDN hosting for portal.fernquill.example
24 months from 1 November 2026, EUR 1,150 a month.
Includes 40 TB of traffic a month; more at EUR 0.01 per GB.
`;

export default async function bake({ edit }) {
  await edit(ADA, async ({ doc, place }) => {
    const attachment = place('attachment');
    await doc.page(attachment.page).annotations.create(
      {
        subtype: 'file-attachment',
        nm: 'attachment',
        rect: attachment.rect,
        contents: 'Quote for the CDN hosting',
        file: { name: 'cdn-quote.txt', mimeType: 'text/plain' },
      },
      { resources: { file: new TextEncoder().encode(QUOTE) } },
    );
  });

  await edit(DANA, async ({ engine, doc, place }) => {
    // The standard Approved stamp, drawn from the default library, under the names apps use.
    const library = await engine.open({ kind: 'bytes', bytes: await loadDefaultLibrary('en') });
    const { namedPages } = await library.pages.list();
    const approved = namedPages.find((entry) => entry.name.startsWith('Approved='));
    const drawing = await library.pages.extract([approved.target.page]);
    await library.close();
    for (const name of ['approval-budget', 'approval-contract']) {
      const stamp = place(name);
      await doc.page(stamp.page).annotations.create(
        { subtype: 'stamp', nm: name, name, subject: 'Approved', box: stamp.rect },
        { resources: { appearance: drawing } },
      );
    }

    // The check: a frame and a word, two annotations.
    const checked = place('checked');
    const on = doc.page(checked.page).annotations;
    await on.create({
      subtype: 'square',
      nm: 'checked-frame',
      box: checked.rect,
      color: '#c4262e',
      strokeWidth: 4,
    });
    await on.create({
      subtype: 'free-text',
      nm: 'checked-text',
      box: checked.rect,
      contents: 'CHECKED',
      fontFamily: 'helvetica-bold',
      fontSize: 24,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontColor: '#c4262e',
      strokeWidth: 0,
    });
  });

  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Spending approvals, Q4 2026',
      author: 'Ada Lovelace',
      subject: 'The infrastructure budget for 2027 and the CDN hosting contract, for approval',
      keywords: 'Fernquill, approvals, budget, contract',
    });
    for (const [index, title] of ['This quarter', 'Next quarter'].entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
