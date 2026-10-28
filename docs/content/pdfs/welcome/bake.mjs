/**
 * The welcome guide, the docs' default document: a short read about PDF, as printed, with a
 * bookmark for each page. Nothing is marked or filled in, so it opens the same in every example.
 * It's ours, so it's built as each brand: EmbedPDF's for embedpdf.com, CloudPDF's for
 * cloudpdf.com (`shared/brand.js` gives the HTML each one's name, logo and tagline).
 */
import { CLOUDPDF, EMBEDPDF } from '../shared/annotations.mjs';

export const brands = [EMBEDPDF, CLOUDPDF];

export default async function bake({ edit, company }) {
  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Documents belong on the web',
      author: company.displayName,
      subject: 'A short field guide to the past, present and future of PDF',
      keywords: `${company.displayName}, PDF, guide`,
    });
    const chapters = [
      'Documents belong on the web',
      'A format from another era',
      'From paper to pixels',
      '1 document, 1,000 workflows',
    ];
    for (const [index, title] of chapters.entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
