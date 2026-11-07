/**
 * Lanternfield's registration form as it was printed: boxes and circles on the page, no fields.
 * The form examples that build a form open it and put the fields there, with tools or from code.
 */
import { LANTERNFIELD } from '../shared/annotations.mjs';

export const company = LANTERNFIELD;

export default async function bake({ edit }) {
  await edit(async ({ doc }) => {
    await doc.metadata.update({
      title: 'Community Day 2027 registration',
      author: 'Lanternfield',
      subject: 'The registration form for Community Day 2027, for printing',
      keywords: 'Lanternfield, registration, event',
    });
  });
}
