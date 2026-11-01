'use client';

import { OUTLINE_COPY } from '../content';
import { BookmarksTool } from './bookmarks-tool';
import { SingleFileTool } from '../shared/single-file';

/** The bookmarks tool as its page shows it: one PDF in, then the viewer with its bookmarks. */
export function BookmarksPageTool() {
  return (
    <SingleFileTool drop={OUTLINE_COPY.drop} keepOpen={false}>
      {(file) => <BookmarksTool file={file} />}
    </SingleFileTool>
  );
}
