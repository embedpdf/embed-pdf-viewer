import { applyInstallChannel } from '@embedpdf/docs-kit/mdx/install-channel';

import { GrantPreviewViewer } from './grant-preview-viewer';

/** The viewer script the docs tell readers to paste, on the docs' release channel. */
const VIEWER_SCRIPT = applyInstallChannel(
  'https://cdn.jsdelivr.net/npm/@cloudpdf/viewer@3/dist/cloudpdf.js',
);

/**
 * A grant, open in the viewer a page gets from the website quick start: the same script from the
 * same CDN, so the reader sees what their page will show before they paste anything.
 */
export function GrantPreview({ grant, height = 560 }: { grant: string; height?: number }) {
  return <GrantPreviewViewer grant={grant} height={height} script={VIEWER_SCRIPT} />;
}
