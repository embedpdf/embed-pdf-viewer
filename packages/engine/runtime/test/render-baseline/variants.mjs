// The render variants a baseline records for every page, per profile.
//
// `engine` variants take the path the engine takes: a page loaded with its rotation
// normalized to 0, rendered with `FPDF_RenderPageBitmapWithMatrix` into BGRA with
// reversed byte order, with the viewer's rotation and region baked into the matrix.
// `classic` variants take `FPDF_RenderPageBitmap` on a page as loaded, which keeps
// the page's own /Rotate and the other bitmap formats covered.

/** A page with more objects than this gets the short variant list. */
export const HEAVY_PAGE_OBJECTS = 200_000;

const ENGINE_FLAGS = 0x11; // FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER
const ANNOT = 0x01;

const page = (id, width, rotation = 0, flags = ENGINE_FLAGS) => ({
  id,
  kind: 'engine',
  region: 'page',
  viewport: { kind: 'width', width },
  rotation,
  flags,
});

// A viewer tile: `size` device pixels square at `scale`, plus `bleed` device pixels on
// every side, anchored at a fraction of the page so every page size gets a tile.
const tile = (id, scale, fx, fy, size = 512, bleed = 1) => ({
  id,
  kind: 'engine',
  region: { fx, fy, size, bleed },
  viewport: { kind: 'scale', scale },
  rotation: 0,
  flags: ENGINE_FLAGS,
});

const classic = (id, width, format, flags, rotate = 0) => ({
  id,
  kind: 'classic',
  width,
  format,
  flags,
  rotate,
});

const FAST = [
  page('page@w640', 640),
  page('page@w137r90', 137, 90),
  page('page@w1237', 1237),
  tile('tile@s2.37:a', 2.37, 0.37, 0.41),
  tile('tile@s2.37:b', 2.37, 0.61, 0.19),
  tile('tile@s11.3:c', 11.3, 0.5, 0.5),
  classic('classic@w640:bgrx', 640, 'bgrx', ANNOT),
  classic('classic@w640:bgra-noannot', 640, 'bgra', 0),
];

const RELEASE_EXTRA = [
  page('page@w2048', 2048),
  page('page@w640r180', 640, 180),
  page('page@w640r270', 640, 270),
  page('page@w640:noannot', 640, 0, 0x10),
  tile('tile@s5.13:d', 5.13, 0.23, 0.77),
  tile('tile@s0.8:e', 0.8, 0, 0),
  classic('classic@w1237r1:bgrx', 1237, 'bgrx', ANNOT, 1),
  classic('classic@w333r3:bgra', 333, 'bgra', ANNOT, 3),
];

const HEAVY_FAST = ['page@w640', 'tile@s2.37:a', 'tile@s11.3:c'];
const HEAVY_RELEASE = [...HEAVY_FAST, 'page@w137r90', 'classic@w640:bgrx', 'tile@s5.13:d'];

export const PROFILES = {
  fast: {
    variants: FAST,
    heavy: HEAVY_FAST,
    pages: (count) => (count > 0 ? [0] : []),
  },
  release: {
    variants: [...FAST, ...RELEASE_EXTRA],
    heavy: HEAVY_RELEASE,
    pages: (count) => {
      const pages = new Set();
      for (let i = 0; i < Math.min(count, 5); i++) pages.add(i);
      if (count > 0) pages.add(count - 1);
      return [...pages];
    },
  },
};

export function profileByName(name) {
  const profile = PROFILES[name];
  if (!profile)
    throw new Error(`unknown profile ${name}; use ${Object.keys(PROFILES).join(' or ')}`);
  return profile;
}
