/**
 * The registration form as it was printed: boxes and circles on the page, no fields. The form
 * examples that build a form open it and put the fields there, with tools or from code.
 */
export default async function bake({ edit }) {
  await edit(async ({ doc }) => {
    await doc.metadata.update({
      title: 'Community Day 2027 registration',
      author: 'EmbedPDF',
      subject: 'The registration form for Community Day 2027, for printing',
      keywords: 'EmbedPDF, registration, event',
    });
  });
}
