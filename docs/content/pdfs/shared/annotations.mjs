/**
 * What the documents' bakes share: the companies they belong to, the people who mark them up, and
 * helpers that place annotations the way the viewer writes them. Dana Smith has the id the docs
 * give her everywhere (`u_381`), so in an example opened as Dana her marks are her own.
 */

/**
 * The companies the documents belong to. A bake exports its document's as `company`, and what its
 * unnamed `edit()` steps add is written as the company. Fernquill and Lanternfield are made up, so
 * nobody takes their invoices and notices for ours. Only the welcome is ours: it exports `brands`
 * instead, and is built once as each, for the site of that brand.
 */
export const EMBEDPDF = { userId: 'embedpdf', displayName: 'EmbedPDF' };
export const CLOUDPDF = { userId: 'cloudpdf', displayName: 'CloudPDF' };
/** Fernquill Ltd builds a document portal. Ada Lovelace is its CTO; Dana Smith runs operations. */
export const FERNQUILL = { userId: 'fernquill', displayName: 'Fernquill Ltd' };
/** Lanternfield sells a toolkit for apps, with licences and support. Sam Okafor signs for it. */
export const LANTERNFIELD = { userId: 'lanternfield', displayName: 'Lanternfield' };

export const DANA = { userId: 'u_381', displayName: 'Dana Smith' };
export const ADA = { userId: 'u_204', displayName: 'Ada Lovelace' };
export const SAM = { userId: 'u_517', displayName: 'Sam Okafor' };

/** Marks the one place `text` is in the document, with the lines it covers as the quads. */
export async function markText(doc, text, data) {
  const { matches } = await doc.search.query({ text, matchCase: true });
  if (matches.length !== 1) throw new Error(`"${text}" is in the document ${matches.length} times`);
  const [match] = matches;
  const { annotation } = await doc.page(match.page).annotations.create({
    ...data,
    quadPoints: match.segments.map((segment) => segment.quad),
  });
  return { page: match.page, ref: annotation.ref, rect: annotation.rect };
}

/** A note at `place` (a box the HTML marks), returned with its page, ref and rect for replies. */
export async function addNote(doc, place, data) {
  const { annotation } = await doc.page(place.page).annotations.create({
    subtype: 'text',
    rect: place.rect,
    color: '#facc15',
    ...data,
  });
  return { page: place.page, ref: annotation.ref, rect: place.rect };
}

/** A reply to `root` (from `markText` or `addNote`), the way the viewer's comments write one. */
export function reply(doc, root, text) {
  return doc.page(root.page).annotations.create({
    subtype: 'text',
    rect: replyRect(root.rect),
    icon: 'comment',
    contents: text,
    reply: { to: root.ref },
    noZoom: true,
    noRotate: true,
  });
}

/** A reviewer's verdict on `root`, such as `'accepted'`: a hidden reply, as the viewer writes it. */
export function setStatus(doc, root, state) {
  return doc.page(root.page).annotations.create({
    subtype: 'text',
    rect: replyRect(root.rect),
    reply: { to: root.ref },
    state,
    stateModel: 'review',
    hidden: true,
    noZoom: true,
    noRotate: true,
  });
}

const replyRect = (rect) => ({ x: rect.x, y: rect.y, width: 20, height: 20 });

export const inset = (rect, by) => ({
  x: rect.x + by,
  y: rect.y + by,
  width: rect.width - 2 * by,
  height: rect.height - 2 * by,
});

export const outset = (rect, by) => inset(rect, -by);

/** The points of a hand-drawn loop around `rect`: an ellipse that overshoots where it closes. */
export function loopAround(rect, by = 8) {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const radius = { x: rect.width / 2 + by, y: rect.height / 2 + by * 0.8 };
  return Array.from({ length: 40 }, (_, step) => {
    const angle = -Math.PI * 0.6 + (step / 36) * 2 * Math.PI;
    return {
      x: center.x + radius.x * Math.cos(angle),
      y: center.y + radius.y * Math.sin(angle),
    };
  });
}
