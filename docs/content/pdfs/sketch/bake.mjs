/**
 * The empty floor plan: no annotations, so the examples that open it to draw on show only what the
 * reader draws, and a list of annotations starts empty.
 */
export default async function bake({ edit }) {
  await edit(async ({ doc }) => {
    await doc.metadata.update({
      title: 'Studio floor plan',
      author: 'EmbedPDF maintainers',
      subject: 'The second floor of the studio, empty, for planning the move',
      keywords: 'EmbedPDF, floor plan, office',
    });
  });
}
