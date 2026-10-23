/**
 * The proposal under review: Dana Smith's comments on Ada Lovelace's draft, and Ada's answers.
 * Every mark carries a comment, so every thread has something to read, and the conversation runs
 * in the order it happened: each `edit()` step is one person's turn.
 */
import { ADA, DANA, addNote, markText, outset, reply, setStatus } from '../shared/annotations.mjs';

export default async function bake({ edit }) {
  let titleNote;
  let highlight;
  let phoneNote;

  await edit(DANA, async ({ doc, place }) => {
    titleNote = await addNote(doc, place('note-title'), {
      nm: 'note-title',
      contents: 'Can we ship this in 3.1 instead of 3.2?',
    });
    highlight = await markText(doc, 'so a reviewer opens them one by one to read a conversation', {
      subtype: 'highlight',
      nm: 'highlight',
      color: '#ffcd45',
      contents: 'This is the key point. Lead with it.',
    });
    await markText(doc, 'replaces the old floating popups entirely', {
      subtype: 'strikeout',
      nm: 'strikeout',
      color: '#e5484d',
      contents: 'Keep the popups for quick reads; the sidebar is for long threads.',
    });
    const phases = place('phases');
    await doc.page(phases.page).annotations.create({
      subtype: 'square',
      nm: 'phases-box',
      box: outset(phases.rect, 4),
      color: '#e5484d',
      strokeWidth: 2,
      contents: 'Merge phases 2 and 3?',
    });
  });

  await edit(ADA, async ({ doc, place }) => {
    await reply(doc, titleNote, 'Only if the thread list lands in October.');
    await reply(doc, highlight, 'Moved it to the top in the next draft.');
    phoneNote = await addNote(doc, place('note-phone'), {
      nm: 'note-phone',
      contents: 'I’ll add a mock-up of the phone layout here.',
    });
    await markText(doc, 'we lean towards the same', {
      subtype: 'underline',
      nm: 'underline',
      color: '#30a46c',
      contents: 'Needs a decision in the design review.',
    });
  });

  await edit(DANA, async ({ doc }) => {
    await reply(doc, titleNote, 'Agreed. Let’s aim for 3.1.');
    await setStatus(doc, phoneNote, 'accepted');
  });

  await edit(async ({ doc, pages }) => {
    await doc.metadata.update({
      title: 'Proposal: a comments sidebar for the ready-made viewer',
      author: 'Ada Lovelace',
      subject: 'A sidebar that lists every comment thread, with review comments',
      keywords: 'EmbedPDF, proposal, comments, review',
    });
    for (const [index, title] of ['Problem and proposal', 'Open questions'].entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });
}
