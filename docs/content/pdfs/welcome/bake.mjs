/**
 * The welcome guide, the docs' default document: a short read about PDF, as printed, with a
 * bookmark for each page. Nothing is marked or filled in, so it opens the same in every example.
 */
export default async function bake({ edit }) {
  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Documents belong on the web',
      author: 'EmbedPDF',
      subject: 'A short field guide to the past, present and future of PDF',
      keywords: 'EmbedPDF, PDF, guide',
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
