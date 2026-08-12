'use client';

import { Feedback as KitFeedback } from '@embedpdf/docs-kit';
import type { ComponentProps } from 'react';

/** Site binding: the EmbedPDF docs report bugs against the OSS repo. */
function buildIssueUrl(path: string, sectionId: string | null): string {
  const body = `Documentation page: ${path}${sectionId ? `#${sectionId}` : ''}\n\nWhat happened?\n`;
  return `https://github.com/embedpdf/embed-pdf-viewer/issues/new?title=${encodeURIComponent(
    `Docs: issue on ${path}`,
  )}&body=${encodeURIComponent(body)}`;
}

type Props = Omit<ComponentProps<typeof KitFeedback>, 'site' | 'buildIssueUrl'>;

export function Feedback(props: Props) {
  return <KitFeedback {...props} site="embedpdf" buildIssueUrl={buildIssueUrl} />;
}
