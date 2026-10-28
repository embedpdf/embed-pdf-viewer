/**
 * Lanternfield's support agreement as it reaches Fernquill: Lanternfield has signed it, and the
 * customer's signature field is still empty. The signature examples sign or fill the empty field;
 * the one about breaking a signature edits the document Lanternfield signed. The certificate
 * Lanternfield signed with is published next to the PDF, so an example can trust it.
 */
import { createTestSigner, sign as signField } from '@embedpdf/core-signature';
import { LANTERNFIELD, SAM } from '../shared/annotations.mjs';

export const company = LANTERNFIELD;

export default async function bake({ edit }) {
  await edit(async ({ doc, place }) => {
    await doc.forms.create({
      family: 'signature',
      name: 'approval',
      required: true,
      alternateName: 'Signature for Fernquill Ltd',
      widgets: [place('approval')],
    });
    await doc.forms.create({
      family: 'signature',
      name: 'provider',
      alternateName: 'Signature for Lanternfield',
      widgets: [place('provider')],
    });

    await doc.metadata.update({
      title: 'Support agreement',
      author: 'Lanternfield',
      subject: 'Priority support for Fernquill Ltd, for twelve months from November 2026',
      keywords: 'Lanternfield, agreement, support, signature',
    });
  });
}

/** Sam Okafor signs for Lanternfield after the document is saved whole: the signature seals it. */
export async function sign({ engine, doc, pages, publish }) {
  const signer = await createTestSigner({ commonName: SAM.displayName });
  await signField(doc, {
    field: { kind: 'fqn', name: 'provider' },
    key: signer,
    appearance: { pdf: await typedSignature(engine, doc, pages[0].ref, SAM.displayName) },
    signer: {
      name: SAM.displayName,
      reason: 'Agreed for Lanternfield',
      location: 'Amsterdam',
      signedAt: new Date('2026-10-20T10:00:00+02:00'),
    },
  });
  publish('.cer', signer.certificate);
}

/**
 * A typed signature as a one-page PDF, the way the stamp plugin makes one: a text box on a scratch
 * copy of a page, exported as its appearance.
 */
async function typedSignature(engine, doc, page, text) {
  const scratch = await engine.open({ kind: 'bytes', bytes: await doc.pages.extract([page]) });
  try {
    const [first] = (await scratch.pages.list()).pages;
    const { annotation } = await scratch.page(first.ref).annotations.create({
      subtype: 'free-text',
      intent: 'free-text',
      contents: text,
      fontFamily: 'times-italic',
      fontSize: 30,
      textAlign: 'center',
      verticalAlign: 'middle',
      box: { x: 0, y: 0, width: 190, height: 46 },
      fontColor: '#1d2b53',
      strokeWidth: 0,
    });
    return new Uint8Array(await scratch.page(first.ref).annotations.exportAppearance([annotation.ref]));
  } finally {
    await scratch.close();
  }
}
