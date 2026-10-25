/**
 * The links document, a short manual. Chrome makes its links to pages, spots on a page, websites
 * and email from the HTML's own links; this adds the ones Chrome can't: the footer's Previous and
 * Next, which run a viewer command (a named action).
 */
export default async function bake({ edit }) {
  await edit(async ({ doc, pages, places }) => {
    const steps = [
      ['previous-page', 'PrevPage'],
      ['next-page', 'NextPage'],
    ];
    for (const [mark, name] of steps) {
      for (const { page, rect } of places(mark)) {
        await doc.page(page).annotations.create({
          subtype: 'link',
          rect,
          target: { kind: 'named', name },
        });
      }
    }

    await doc.metadata.update({
      title: 'Brand guidelines',
      author: 'EmbedPDF',
      subject: 'How EmbedPDF looks: the logo, colour and type',
      keywords: 'EmbedPDF, brand, logo, colour, type',
    });

    const chapters = ['Contents', 'Logo', 'Colour', 'Type'];
    for (const [index, title] of chapters.entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
