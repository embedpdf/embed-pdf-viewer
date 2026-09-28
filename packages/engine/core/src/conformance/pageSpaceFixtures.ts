import { pdfOf } from './pdfOf';
import type { PdfRect, PdfRotation } from '../geometry/primitives';

/**
 * Small PDFs whose page boxes are odd in every way ISO 32000 allows, and in
 * the ways broken files are odd, each with its answer written out by hand:
 * the visible page box, the five boxes, the turn and the unit size. The
 * answers come from the standard, never from our code, so a check against
 * them is a check of our code:
 *   - ISO 32000-1 Table 30 and §7.7.3.4: which boxes a page inherits;
 *   - ISO 32000-1 §7.9.5: a box's corners in any order;
 *   - ISO 32000-1 §14.11.2: the defaults, and every box inside the media box.
 * For broken files the standard has no answer; those carry our rule and say
 * so.
 *
 * Each page draws black squares (`marks`) and words at known places in file
 * coordinates, so a render shows where the page's corner really is.
 */

/** A word drawn in Helvetica, its baseline starting at `x, y` (file coordinates). */
export interface PageSpaceWord {
  text: string;
  x: number;
  y: number;
  size: number;
}

/** A link on a page to a spot on another page of the same file. */
export interface PageSpaceLink {
  /** Where the link sits, in file coordinates. */
  rect: PdfRect;
  /** The index of the page it goes to. */
  toPage: number;
  /** The destination array after the page reference, as the file writes it. */
  view: string;
  /**
   * The destination measured from the top-left of the target page's visible
   * box (x from its left edge, y from its top edge); `null` keeps the current
   * value.
   */
  expected: {
    kind: 'xyz' | 'fitH' | 'fitV' | 'fitR';
    x?: number | null;
    y?: number | null;
    width?: number;
    height?: number;
  };
}

export interface PageSpaceBoxes {
  media: PdfRect;
  crop: PdfRect;
  bleed: PdfRect;
  trim: PdfRect;
  art: PdfRect;
}

export interface PageSpaceFixturePage {
  /** The page dictionary's own entries: boxes, `/Rotate`, `/UserUnit`. */
  entries: string;
  marks: PdfRect[];
  words: PageSpaceWord[];
  links?: PageSpaceLink[];
  expected: {
    /** The visible page box: what the page shows, in file coordinates. */
    visible: PdfRect;
    /** The five boxes as ISO defines them: defaults applied, reduced to the media box. */
    boxes: PageSpaceBoxes;
    rotation: PdfRotation;
    userUnit: number;
  };
}

export interface PageSpaceFixture {
  name: string;
  /** The rule the fixture checks. */
  about: string;
  /**
   * `iso`: the answers are the standard's. `recovery`: the file is broken and
   * the answers are our rule, which is what Acrobat shows.
   */
  source: 'iso' | 'recovery';
  /** Entries of the page tree node, inherited by pages that don't set them. */
  treeEntries?: string;
  pages: PageSpaceFixturePage[];
  bytes: Uint8Array;
}

const rect = (left: number, bottom: number, right: number, top: number): PdfRect => ({
  left,
  bottom,
  right,
  top,
});

/** Every box the same: a page with only a media box, or crop defaults all round. */
const sameBoxes = (media: PdfRect, crop: PdfRect = media): PageSpaceBoxes => ({
  media,
  crop,
  bleed: crop,
  trim: crop,
  art: crop,
});

interface FixtureSpec {
  name: string;
  about: string;
  source: PageSpaceFixture['source'];
  treeEntries?: string;
  pages: PageSpaceFixturePage[];
}

function contentOf(page: PageSpaceFixturePage): string {
  const marks = page.marks.map(
    (m) => `0 g ${m.left} ${m.bottom} ${m.right - m.left} ${m.top - m.bottom} re f`,
  );
  const words = page.words.map((w) => `BT /F1 ${w.size} Tf 0 g ${w.x} ${w.y} Td (${w.text}) Tj ET`);
  return [...marks, ...words].join('\n');
}

/**
 * Objects: 1 catalog, 2 page tree, 3 font, then a page and its content per
 * page, then the link annotations.
 */
function build(spec: FixtureSpec): PageSpaceFixture {
  const pageNumber = (index: number) => 4 + index * 2;
  const links = spec.pages.flatMap((page, index) =>
    (page.links ?? []).map((link) => ({ link, from: index })),
  );
  const firstLink = 4 + spec.pages.length * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${spec.pages.map((_, i) => `${pageNumber(i)} 0 R`).join(' ')}] /Count ${spec.pages.length} ${spec.treeEntries ?? ''} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  spec.pages.forEach((page, index) => {
    const own = links
      .map((entry, i) => ({ ...entry, number: firstLink + i }))
      .filter((entry) => entry.from === index)
      .map((entry) => `${entry.number} 0 R`);
    const annots = own.length ? ` /Annots [${own.join(' ')}]` : '';
    const content = contentOf(page);
    objects.push(
      `<< /Type /Page /Parent 2 0 R ${page.entries} /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNumber(index) + 1} 0 R${annots} >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  for (const { link } of links) {
    const r = link.rect;
    objects.push(
      `<< /Type /Annot /Subtype /Link /Rect [${r.left} ${r.bottom} ${r.right} ${r.top}] /Border [0 0 0] /Dest [${pageNumber(link.toPage)} 0 R ${link.view}] >>`,
    );
  }
  return { ...spec, bytes: pdfOf(objects) };
}

const LETTER = rect(0, 0, 612, 792);

/** What a box that shares nothing with the media box becomes. */
const EMPTY: PdfRect = { left: 0, right: 0, bottom: 0, top: 0 };

/** A page on `media` (cropped to `crop`) with a mark and a word placed inside `visible`. */
function markedPage(
  entries: string,
  visible: PdfRect,
  expected: Omit<PageSpaceFixturePage['expected'], 'visible'>,
  extra: Partial<Pick<PageSpaceFixturePage, 'links'>> = {},
): PageSpaceFixturePage {
  const { left, top, right, bottom } = visible;
  return {
    entries,
    // One mark near the top-left corner, one near the bottom-right: a page
    // measured from the wrong corner puts at least one of them wrong.
    marks: [
      rect(left + 40, top - 90, left + 90, top - 40),
      rect(right - 90, bottom + 40, right - 40, bottom + 90),
    ],
    words: [{ text: 'Corner', x: left + 40, y: top - 160, size: 24 }],
    ...extra,
    expected: { visible, ...expected },
  };
}

export const PAGE_SPACE_FIXTURES: readonly PageSpaceFixture[] = [
  build({
    name: 'letter',
    about: 'the control: a media box at 0,0 and nothing else',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [0 0 612 792]', LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'negative-origin',
    about: 'a media box around 0,0, so its corner is at negative numbers',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [-306 -396 306 396]', rect(-306, -396, 306, 396), {
        boxes: sameBoxes(rect(-306, -396, 306, 396)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'cad-origin',
    about: 'a large drawing centred on 0,0, as CAD programs export (v2 issue #625)',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [-1685 -1192 1685 1192]', rect(-1685, -1192, 1685, 1192), {
        boxes: sameBoxes(rect(-1685, -1192, 1685, 1192)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'crop-inside',
    about: 'a crop box inside the media box, away from its corner',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [0 0 612 792] /CropBox [50 60 562 732]', rect(50, 60, 562, 732), {
        boxes: sameBoxes(LETTER, rect(50, 60, 562, 732)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'crop-past-media',
    about: 'a crop box reaching past the media box is reduced to their intersection (§14.11.2)',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [0 0 612 792] /CropBox [300 400 900 1000]', rect(300, 400, 612, 792), {
        boxes: sameBoxes(LETTER, rect(300, 400, 612, 792)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'flipped-corners',
    about: 'boxes given by their other corners are normalized (§7.9.5)',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [612 792 0 0] /CropBox [562 732 50 60]', rect(50, 60, 562, 732), {
        boxes: sameBoxes(LETTER, rect(50, 60, 562, 732)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'inherited',
    about:
      'media box, crop box and /Rotate are inherited from the page tree; bleed, trim and art boxes are not (Table 30)',
    source: 'iso',
    treeEntries:
      '/MediaBox [0 0 500 700] /CropBox [20 30 480 680] /Rotate 90 /BleedBox [0 0 500 700] /TrimBox [10 10 490 690]',
    pages: [
      markedPage('', rect(20, 30, 480, 680), {
        boxes: sameBoxes(rect(0, 0, 500, 700), rect(20, 30, 480, 680)),
        rotation: 90,
        userUnit: 1,
      }),
      markedPage('/MediaBox [0 0 300 400] /Rotate 0', rect(20, 30, 300, 400), {
        boxes: sameBoxes(rect(0, 0, 300, 400), rect(20, 30, 300, 400)),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'page-boxes',
    about:
      'bleed, trim and art boxes: a missing one defaults to the crop box, one past the media box is reduced to it (§14.11.2)',
    source: 'iso',
    pages: [
      markedPage(
        '/MediaBox [0 0 612 792] /CropBox [36 36 576 756] /BleedBox [30 30 582 762] /TrimBox [-10 -10 700 900]',
        rect(36, 36, 576, 756),
        {
          boxes: {
            media: LETTER,
            crop: rect(36, 36, 576, 756),
            bleed: rect(30, 30, 582, 762),
            trim: LETTER,
            art: rect(36, 36, 576, 756),
          },
          rotation: 0,
          userUnit: 1,
        },
      ),
    ],
  }),
  build({
    name: 'turned',
    about:
      "a page's /Rotate never moves its positions; negative and full-turn values are the same turn (Table 30)",
    source: 'iso',
    pages: ([90, 180, 270, -90, 450] as const).map((turn) =>
      markedPage(
        `/MediaBox [0 0 612 792] /CropBox [50 60 562 732] /Rotate ${turn}`,
        rect(50, 60, 562, 732),
        {
          boxes: sameBoxes(LETTER, rect(50, 60, 562, 732)),
          rotation: (((turn % 360) + 360) % 360) as PdfRotation,
          userUnit: 1,
        },
      ),
    ),
  }),
  build({
    name: 'user-unit',
    about: '/UserUnit changes the size of a unit, not the numbers',
    source: 'iso',
    pages: [
      markedPage('/MediaBox [0 0 306 396] /UserUnit 2', rect(0, 0, 306, 396), {
        boxes: sameBoxes(rect(0, 0, 306, 396)),
        rotation: 0,
        userUnit: 2,
      }),
    ],
  }),
  build({
    name: 'destinations',
    about: "a destination is measured from its target page's visible box, not the link's page",
    source: 'iso',
    pages: [
      markedPage(
        '/MediaBox [0 0 612 792]',
        LETTER,
        { boxes: sameBoxes(LETTER), rotation: 0, userUnit: 1 },
        {
          links: [
            {
              rect: rect(400, 700, 500, 740),
              toPage: 1,
              view: '/XYZ -250 350 0',
              expected: { kind: 'xyz', x: 50, y: 40 },
            },
            {
              rect: rect(400, 640, 500, 680),
              toPage: 1,
              view: '/XYZ null null 0',
              expected: { kind: 'xyz', x: null, y: null },
            },
            {
              rect: rect(400, 580, 500, 620),
              toPage: 1,
              view: '/FitR -200 -100 100 300',
              expected: { kind: 'fitR', x: 100, y: 90, width: 300, height: 400 },
            },
          ],
        },
      ),
      markedPage(
        '/MediaBox [-306 -396 306 396] /CropBox [-300 -390 300 390]',
        rect(-300, -390, 300, 390),
        {
          boxes: sameBoxes(rect(-306, -396, 306, 396), rect(-300, -390, 300, 390)),
          rotation: 0,
          userUnit: 1,
        },
        {
          links: [
            {
              rect: rect(100, 300, 200, 340),
              toPage: 0,
              view: '/FitH 700',
              expected: { kind: 'fitH', y: 92 },
            },
            {
              rect: rect(100, 240, 200, 280),
              toPage: 0,
              view: '/FitV 30',
              expected: { kind: 'fitV', x: 30 },
            },
          ],
        },
      ),
    ],
  }),
  build({
    name: 'no-media-box',
    about: 'a page without a media box (required, so the file is broken): US Letter',
    source: 'recovery',
    pages: [markedPage('', LETTER, { boxes: sameBoxes(LETTER), rotation: 0, userUnit: 1 })],
  }),
  build({
    name: 'empty-media-box',
    about: 'a media box with no area (broken): US Letter',
    source: 'recovery',
    pages: [
      markedPage('/MediaBox [0 0 0 0]', LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'short-crop-box',
    about: 'a crop box of three numbers (broken) counts as missing',
    source: 'recovery',
    pages: [
      markedPage('/MediaBox [0 0 612 792] /CropBox [50 60 562]', LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'bad-user-unit',
    about: 'a /UserUnit of zero or below (broken) counts as 1',
    source: 'recovery',
    pages: [
      markedPage('/MediaBox [0 0 612 792] /UserUnit 0', LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
      markedPage('/MediaBox [0 0 612 792] /UserUnit -2', LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'crop-outside-media',
    about: 'a crop box entirely outside the media box (broken): an empty page, as Acrobat shows it',
    source: 'recovery',
    pages: [
      markedPage('/MediaBox [0 0 612 792] /CropBox [700 800 900 1000]', EMPTY, {
        boxes: sameBoxes(LETTER, EMPTY),
        rotation: 0,
        userUnit: 1,
      }),
    ],
  }),
  build({
    name: 'odd-rotate',
    about: '/Rotate that is not a multiple of 90 (broken): no turn, as Acrobat shows it',
    source: 'recovery',
    pages: ([45, 135] as const).map((turn) =>
      markedPage(`/MediaBox [0 0 612 792] /Rotate ${turn}`, LETTER, {
        boxes: sameBoxes(LETTER),
        rotation: 0,
        userUnit: 1,
      }),
    ),
  }),
];
