'use client';

import { METADATA_COPY } from '../content';
import { MetadataTool } from './metadata-tool';
import { SingleFileTool } from '../shared/single-file';

/** The metadata tool as its page shows it: one PDF in, then its details. */
export function MetadataPageTool() {
  return (
    <SingleFileTool drop={METADATA_COPY.drop}>
      {(file) => <MetadataTool file={file} />}
    </SingleFileTool>
  );
}
