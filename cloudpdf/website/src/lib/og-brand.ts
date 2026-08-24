import fs from 'node:fs';
import path from 'node:path';

import type { DocsOgBrand } from '@embedpdf/docs-kit/og';

/**
 * Everything this site owns about its social cards. The rest — layout,
 * palette, type, the code panel — is kit machinery shared with embedpdf.com;
 * both brands are drawn from the same colour system, so nothing but the
 * lockup and the domain differs here.
 *
 * The lockup is inlined as a data URI rather than referenced by path: OG
 * images are generated statically, with no server to resolve `/…` against.
 * Width is the real 697×107 aspect at the card's 46px cap height, because
 * Satori will not measure an SVG.
 */
const lockup = fs.readFileSync(path.join(process.cwd(), 'public', 'CloudPDF-Logo.svg'));

export const ogBrand: DocsOgBrand = {
  logo: {
    src: `data:image/svg+xml;base64,${lockup.toString('base64')}`,
    width: 300,
    height: 46,
  },
  origin: 'cloudpdf.com',
};
