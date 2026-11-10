/**
 * Two marks of the app's own, a check mark and a cross, as a stamp library: the kind of PDF
 * Acrobat keeps its stamps in, which the viewer's examples load as the app's own
 * (`plugins.stamp.libraries`). Chrome prints one page per mark; the bake gives the library its
 * name, the title, and each page its stamp's `identifier=label` name. Examples load it by URL and
 * never open it as a document.
 */
import { LANTERNFIELD } from '../shared/annotations.mjs';

export const company = LANTERNFIELD;

const STAMPS = ['Check=Check mark', 'Cross=Cross'];

export default async function bake({ edit }) {
  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({ title: 'Marks' });
    for (const [index, name] of STAMPS.entries()) {
      await doc.pages.setName({ name, page: pages[index].ref });
    }
  });
}
