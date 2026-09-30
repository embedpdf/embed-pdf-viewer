import { PageView } from '@embedpdf/react/page-view';
import { RenderLayer } from '@embedpdf/react/render';
import { usePageList, type PageRef } from '@embedpdf/react/runtime';

export function PagePicker({ onPick }: { onPick: (page: PageRef) => void }) {
  const pages = usePageList();
  return pages.map((page) => (
    <button key={page.index} onClick={() => onPick(page.ref)}>
      <PageView page={page.ref} width={120}>
        <RenderLayer />
      </PageView>
      {page.label ?? page.index + 1}
    </button>
  ));
}
