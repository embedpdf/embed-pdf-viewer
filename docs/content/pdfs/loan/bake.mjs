/**
 * Fernquill Ltd's equipment loan form as it was printed: a form two people sign, the borrower and
 * the manager who approves the loan, with boxes on the page and no fields. The form example that
 * places fields for two signers opens it; its sender puts the fields there.
 */
import { FERNQUILL } from '../shared/annotations.mjs';

export const company = FERNQUILL;

export default async function bake({ edit }) {
  await edit(async ({ doc }) => {
    await doc.metadata.update({
      title: 'Equipment loan',
      author: 'Fernquill Ltd',
      subject: 'The form a borrower and their manager sign when equipment is lent',
      keywords: 'Fernquill, equipment, loan, signatures',
    });
  });
}
