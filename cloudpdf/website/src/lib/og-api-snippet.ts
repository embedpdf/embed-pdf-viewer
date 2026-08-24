import { fitsPanel, ogSnippetFilename, type OgSnippet } from '@embedpdf/docs-kit/og';

import { getOperationSnippets } from './api-reference';

/**
 * The API reference's own rung of the social-card ladder.
 *
 * A generated operation page opens on a full SDK example — imports, client
 * construction, then the call — which is far too tall for the card. The
 * generated data already draws the line the page draws: `frameLines` counts
 * the shared prelude, and `<ApiOperation>` renders exactly that prelude at
 * reduced opacity so the operation itself reads as the subject
 * (`.snippet-frame` in components/docs/api-reference.tsx).
 *
 * So the card takes the operation body — the part the page emphasises,
 * verbatim. Nothing is assembled, and nothing appears that the page does not
 * already show at full strength.
 *
 * The reference has a per-reader language switcher and a card is one static
 * image, so it uses the manifest's first language — the same one the switcher
 * opens on.
 */
const OPERATION_ID = /<ApiOperation\s+operationId="([^"]+)"/;

export function apiOperationSnippet(sourceCode: string, basename: string): OgSnippet | null {
  const operationId = sourceCode.match(OPERATION_ID)?.[1];
  if (!operationId) return null;

  const [primary] = getOperationSnippets(operationId);
  if (!primary) return null;

  const body = primary.source.split('\n').slice(primary.frameLines).join('\n').trim();
  if (!body || !fitsPanel(body)) return null;

  return {
    code: body,
    lang: primary.fence,
    filename: ogSnippetFilename(primary.fence, basename),
  };
}
