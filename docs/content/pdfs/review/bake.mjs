/**
 * The review document: the marks a review leaves, already on its pages. Text markup sits on
 * the phrases the engine finds by search; everything else on the boxes the HTML marks. Notes and
 * replies are written as two reviewers, so each thread shows who said what. Every annotation has
 * a name (`nm`), so the docs' examples can find the one they show.
 */
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';

const DANA = { userId: 'u_381', displayName: 'Dana Smith' };
const ADA = { userId: 'u_204', displayName: 'Ada Lovelace' };

const NOTE_COLOR = '#facc15';
const STACK = [
  { color: '#e5484d', interiorColor: '#ffd1d3' },
  { color: '#30a46c', interiorColor: '#c9f0da' },
  { color: '#1e90ff', interiorColor: '#cfe6ff' },
];

export default async function bake({ edit }) {
  // The two notes later steps answer: their page, ref and rect.
  let headingNote = null;
  let exampleNote = null;

  // Shapes, ink, text boxes, stamps and the file: the parts of the document no reviewer wrote.
  await edit(async ({ engine, doc, pages, place }) => {
    const on = (box) => doc.page(box.page).annotations;

    const coverText = place('cover-text-box');
    await on(coverText).create({
      subtype: 'free-text',
      nm: 'cover-text-box',
      box: coverText.rect,
      contents: 'Double-click to type here',
      fontSize: 14,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
      color: '#e9c46a',
    });

    const square = place('square');
    await on(square).create({
      subtype: 'square',
      nm: 'square',
      box: inset(square.rect, 16),
      color: '#1e90ff',
      strokeWidth: 3,
    });

    const circle = place('circle');
    await on(circle).create({
      subtype: 'circle',
      nm: 'circle',
      box: centeredSquare(circle.rect, 16),
      color: '#e5484d',
      strokeWidth: 3,
    });

    const arrow = inset(place('arrow').rect, 18);
    await on(place('arrow')).create({
      subtype: 'line',
      nm: 'arrow',
      linePoints: {
        start: { x: arrow.x, y: arrow.y + arrow.height },
        end: { x: arrow.x + arrow.width, y: arrow.y },
      },
      lineEndings: { start: 'none', end: 'closed-arrow' },
      color: '#1a2748',
      strokeWidth: 3,
    });

    // Three filled rectangles, each a step down and to the right of the one before.
    const stack = inset(place('stack').rect, 10);
    const card = { width: stack.width * 0.6, height: stack.height * 0.55 };
    for (const [index, colors] of STACK.entries()) {
      await on(place('stack')).create({
        subtype: 'square',
        nm: `stack-${index + 1}`,
        box: {
          x: stack.x + index * stack.width * 0.2,
          y: stack.y + index * stack.height * 0.225,
          ...card,
        },
        ...colors,
        strokeWidth: 3,
      });
    }

    const polygon = centeredSquare(place('polygon').rect, 12);
    await on(place('polygon')).create({
      subtype: 'polygon',
      nm: 'polygon',
      vertices: regularPolygon(polygon, 5),
      color: '#7c3aed',
      interiorColor: '#ede9fe',
      strokeWidth: 3,
    });

    const ink = inset(place('ink').rect, 18);
    const wave = Array.from({ length: 33 }, (_, step) => ({
      x: ink.x + (ink.width * step) / 32,
      y: ink.y + ink.height / 2 + Math.sin(step / 2.5) * (ink.height / 3),
    }));
    await on(place('ink')).create({
      subtype: 'ink',
      nm: 'ink',
      inkList: [wave],
      color: '#1a2748',
      strokeWidth: 3,
    });

    const textBox = place('text-box');
    await on(textBox).create({
      subtype: 'free-text',
      nm: 'text-box',
      box: textBox.rect,
      contents: 'Double-click to type in this text box.',
      fontSize: 14,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
      color: '#e9c46a',
    });

    const richText = place('rich-text');
    await on(richText).create({
      subtype: 'free-text',
      nm: 'rich-text',
      box: richText.rect,
      interiorColor: '#fffbe6',
      color: '#e9c46a',
      richText: {
        body: { family: 'Helvetica', size: 14, color: '#1a2748' },
        paragraphs: [
          {
            runs: [
              { text: 'Double-click me, select a word, then make it ' },
              { text: 'bold', style: { weight: 700 } },
              { text: ' or ' },
              { text: 'red', style: { color: '#c00000' } },
              { text: '.' },
            ],
          },
        ],
      },
    });

    // The standard Approved stamp, drawn from the default library, under the names apps use.
    const library = await engine.open({ kind: 'bytes', bytes: await loadDefaultLibrary('en') });
    const { namedPages } = await library.pages.list();
    const approved = namedPages.find((entry) => entry.name.startsWith('Approved='));
    const drawing = await library.pages.extract([approved.target.page]);
    await library.close();
    for (const name of ['approval-budget', 'approval-contract']) {
      const stamp = place(name);
      await on(stamp).create(
        { subtype: 'stamp', nm: name, name, subject: 'Approved', box: stamp.rect },
        { resources: { appearance: drawing } },
      );
    }

    // A frame and a word, ready to be turned into one stamp.
    const checked = place('checked');
    await on(checked).create({
      subtype: 'square',
      nm: 'checked-frame',
      box: checked.rect,
      color: '#c4262e',
      strokeWidth: 4,
    });
    await on(checked).create({
      subtype: 'free-text',
      nm: 'checked-text',
      box: checked.rect,
      contents: 'CHECKED',
      fontFamily: 'helvetica-bold',
      fontSize: 26,
      textAlign: 'center',
      verticalAlign: 'middle',
      fontColor: '#c4262e',
      strokeWidth: 0,
    });

    const attachment = place('attachment');
    await on(attachment).create(
      {
        subtype: 'file-attachment',
        nm: 'attachment',
        rect: attachment.rect,
        contents: 'Questions for the next review',
        file: { name: 'notes.txt', mimeType: 'text/plain' },
      },
      { resources: { file: new TextEncoder().encode('Questions for the next review.\n') } },
    );

    await doc.metadata.update({
      title: 'Mark it up, right on the page',
      author: 'EmbedPDF',
      subject:
        'A demo document with every kind of annotation: markup, notes, shapes, ink, text boxes and stamps',
      keywords: 'EmbedPDF, PDF, annotations, comments, demo',
    });
    const chapters = [
      'Mark it up, right on the page',
      'Highlights and notes',
      'Shapes and ink',
      'Text boxes and stamps',
      'Your turn',
    ];
    for (const [index, title] of chapters.entries()) {
      await doc.outline.create({
        title,
        target: { kind: 'goto', destination: { kind: 'fit', page: pages[index].ref } },
      });
    }
  });

  // Dana reviews: the cover's title, the heading, and two marks in the text.
  await edit(DANA, async ({ doc, place }) => {
    await markText(doc, 'right on the page.', {
      subtype: 'highlight',
      nm: 'cover-highlight',
      color: '#ffcd45',
    });
    const coverNote = place('cover-note');
    await doc.page(coverNote.page).annotations.create({
      subtype: 'text',
      nm: 'cover-note',
      rect: coverNote.rect,
      contents: 'Love this title.',
      color: NOTE_COLOR,
    });

    const heading = place('note-heading');
    const { annotation: note } = await doc.page(heading.page).annotations.create({
      subtype: 'text',
      nm: 'note-heading',
      rect: heading.rect,
      contents: 'Can we make this heading shorter?',
      color: NOTE_COLOR,
    });
    headingNote = { page: heading.page, ref: note.ref, rect: heading.rect };
    await markText(doc, 'strikeout proposes to cut it', {
      subtype: 'strikeout',
      nm: 'strikeout',
      color: '#e5484d',
    });
    await markText(doc, 'squiggly line questions it', {
      subtype: 'squiggly',
      nm: 'squiggly',
      color: '#1e90ff',
    });
  });

  // Ada answers, and marks the text herself.
  await edit(ADA, async ({ doc, place }) => {
    const cover = place('cover-box');
    await doc.page(cover.page).annotations.create({
      subtype: 'square',
      nm: 'cover-box',
      box: outset(cover.rect, 8),
      contents: 'Clear and short.',
      color: '#e5484d',
      strokeWidth: 3,
    });
    await reply(doc, headingNote, 'Maybe just “Notes”?');
    await markText(doc, 'A good review starts with one clear mark.', {
      subtype: 'highlight',
      nm: 'highlight',
      color: '#ffcd45',
      contents: 'A strong opening.',
    });
    await markText(doc, 'underline stresses it', {
      subtype: 'underline',
      nm: 'underline',
      color: '#30a46c',
    });
    const example = place('note-example');
    const { annotation: note } = await doc.page(example.page).annotations.create({
      subtype: 'text',
      nm: 'note-example',
      rect: example.rect,
      contents: 'Add an example here.',
      color: NOTE_COLOR,
    });
    exampleNote = { page: example.page, ref: note.ref, rect: example.rect };
  });

  // Dana has the last word on the heading, and accepts Ada's note.
  await edit(DANA, async ({ doc }) => {
    await reply(doc, headingNote, 'I like it. It says what the page is for.');
    await doc.page(exampleNote.page).annotations.create({
      subtype: 'text',
      rect: replyRect(exampleNote.rect),
      reply: { to: exampleNote.ref },
      state: 'accepted',
      stateModel: 'review',
      hidden: true,
      noZoom: true,
      noRotate: true,
    });
  });
}

/** A text annotation answering `note`, the way the viewer's comments write one. */
function reply(doc, note, text) {
  return doc.page(note.page).annotations.create({
    subtype: 'text',
    rect: replyRect(note.rect),
    icon: 'comment',
    contents: text,
    reply: { to: note.ref },
    noZoom: true,
    noRotate: true,
  });
}

/** Marks the one place `text` is in the document, with the lines it covers as the quads. */
async function markText(doc, text, data) {
  const { matches } = await doc.search.query({ text, matchCase: true });
  if (matches.length !== 1) throw new Error(`"${text}" is in the document ${matches.length} times`);
  const [match] = matches;
  await doc.page(match.page).annotations.create({
    ...data,
    quadPoints: match.segments.map((segment) => segment.quad),
  });
}

const replyRect = (rect) => ({ x: rect.x, y: rect.y, width: 20, height: 20 });

const inset = (rect, by) => ({
  x: rect.x + by,
  y: rect.y + by,
  width: rect.width - 2 * by,
  height: rect.height - 2 * by,
});

const outset = (rect, by) => inset(rect, -by);

/** The largest square in `rect`, `margin` in from its shorter sides, centered. */
function centeredSquare(rect, margin) {
  const size = Math.min(rect.width, rect.height) - 2 * margin;
  return {
    x: rect.x + (rect.width - size) / 2,
    y: rect.y + (rect.height - size) / 2,
    width: size,
    height: size,
  };
}

/** The corners of a regular polygon in `box`, the first one at the top. */
function regularPolygon(box, sides) {
  const radius = box.width / 2;
  const center = { x: box.x + radius, y: box.y + radius };
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / sides;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}
