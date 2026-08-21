import fs from 'node:fs';
import path from 'node:path';

import type { DocsOgBrand } from '@embedpdf/docs-kit/og';

import { SITE_ORIGIN } from './site';

/**
 * Everything this site owns about its social cards. The rest — layout,
 * palette, type, the code panel — is kit machinery shared with cloudpdf.com.
 *
 * The lockup is inlined as a data URI rather than referenced by path: OG
 * images are generated statically, with no server to resolve `/…` against.
 * Width is the real 692×134 aspect at the card's 46px cap height, because
 * Satori will not measure an SVG.
 */
const lockup = fs.readFileSync(path.join(process.cwd(), 'public', 'embedpdf-logo.svg'));

export const ogBrand: DocsOgBrand = {
  logo: {
    src: `data:image/svg+xml;base64,${lockup.toString('base64')}`,
    width: 237,
    height: 46,
  },
  origin: new URL(SITE_ORIGIN).host.replace(/^www\./, ''),
};
