/**
 * The agreement, ready for the customer to sign: one signature field, required, and nothing else
 * to fill in. The signature examples sign it, each its own way.
 */
export default async function bake({ edit }) {
  await edit(async ({ doc, place }) => {
    await doc.forms.create({
      family: 'signature',
      name: 'approval',
      required: true,
      alternateName: 'Signature for Analytical Engines Ltd',
      widgets: [place('approval')],
    });

    await doc.metadata.update({
      title: 'Support agreement',
      author: 'EmbedPDF',
      subject: 'Priority support for Analytical Engines Ltd, for twelve months from November 2026',
      keywords: 'EmbedPDF, agreement, support, signature',
    });
  });
}
