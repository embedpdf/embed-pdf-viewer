import type { Metadata } from 'next';

import { TOOLS_INDEX } from '@/components/tools/content';
import { ToolsIndex } from '@/components/tools/shared/tool-page';

export const metadata: Metadata = {
  title: TOOLS_INDEX.metaTitle,
  description: TOOLS_INDEX.metaDescription,
  alternates: { canonical: '/tools' },
};

export default function ToolsPage() {
  return <ToolsIndex />;
}
