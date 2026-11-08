'use client';

import { PDFViewer } from '@cloudpdf/viewer-react';

/**
 * A grant, open in the viewer the website quick start puts on a page, so the reader sees what
 * their page will show before they paste anything.
 */
export function GrantPreview({ grant, height = 560 }: { grant: string; height?: number }) {
  return (
    <div className="border-cp-border mt-6 max-w-[760px] overflow-hidden rounded-[14px] border bg-white shadow-[0_18px_40px_-28px_rgba(10,26,77,0.35)]">
      <PDFViewer src={{ grant }} style={{ display: 'block', height }} />
    </div>
  );
}
