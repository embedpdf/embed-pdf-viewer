import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer } from '@embedpdf/react/render';
import type { PageRef } from '@embedpdf/react/runtime';

export function PagePreview({ page }: { page: PageRef }) {
  return (
    <PageView page={page} width={240}>
      <RenderLayer />
    </PageView>
  );
}
