/**
 * The links document. Chrome makes its links to pages and websites from the HTML's own links;
 * this adds the one Chrome can't: a button that runs a viewer command (a named action).
 */
export default async function bake({ edit }) {
  await edit(async ({ doc, pages, place }) => {
    const nextPage = place('next-page');
    await doc.page(nextPage.page).annotations.create({
      subtype: 'link',
      rect: nextPage.rect,
      target: { kind: 'named', name: 'NextPage' },
    });

    await doc.metadata.update({
      title: 'Every page, one click away',
      author: 'EmbedPDF',
      subject:
        'A demo document with every kind of link: to a page, to a website, and a viewer command',
      keywords: 'EmbedPDF, PDF, links, demo',
    });

    const chapters = [
      'Every page, one click away',
      'Links to a page',
      'You followed a link',
      'Links to the web',
    ];
    for (const [index, title] of chapters.entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
