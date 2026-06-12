import { getDocumentPageOrder, setPageOrder } from '@embedpdf/core';
import { useDocumentState, useRegistry } from '@embedpdf/core/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { PageMoveDownIcon, PageMoveUpIcon } from './icons';
import { ToolbarButton } from './ui';
import { movePageInOrder } from '../utils/page-order';

type PageMoveButtonProps = {
  documentId: string;
};

export function PageMoveUpButton({ documentId }: PageMoveButtonProps) {
  const { registry } = useRegistry();
  const documentState = useDocumentState(documentId);
  const {
    provides: scroll,
    state: { currentPage },
  } = useScroll(documentId);

  const canMoveUp = currentPage > 1;

  const handleMoveUp = () => {
    if (!registry || !documentState || !canMoveUp) return;

    const nextOrder = movePageInOrder(
      getDocumentPageOrder(documentState),
      currentPage - 1,
      currentPage - 2,
    );

    registry.getStore().dispatchToCore(setPageOrder(documentId, nextOrder));
    scroll?.scrollToPage({
      pageNumber: currentPage - 1,
      behavior: 'instant',
    });
  };

  return (
    <ToolbarButton
      onClick={handleMoveUp}
      disabled={!canMoveUp}
      aria-label="Move current page up"
      title="Move Current Page Up"
    >
      <PageMoveUpIcon className="h-4 w-4" />
    </ToolbarButton>
  );
}

export function PageMoveDownButton({ documentId }: PageMoveButtonProps) {
  const { registry } = useRegistry();
  const documentState = useDocumentState(documentId);
  const {
    provides: scroll,
    state: { currentPage },
  } = useScroll(documentId);

  const pageCount = documentState?.document?.pageCount ?? 0;
  const canMoveDown = pageCount > 1 && currentPage < pageCount;

  const handleMoveDown = () => {
    if (!registry || !documentState || !canMoveDown) return;

    const nextOrder = movePageInOrder(
      getDocumentPageOrder(documentState),
      currentPage - 1,
      currentPage,
    );

    registry.getStore().dispatchToCore(setPageOrder(documentId, nextOrder));
    scroll?.scrollToPage({
      pageNumber: currentPage + 1,
      behavior: 'instant',
    });
  };

  return (
    <ToolbarButton
      onClick={handleMoveDown}
      disabled={!canMoveDown}
      aria-label="Move current page down"
      title="Move Current Page Down"
    >
      <PageMoveDownIcon className="h-4 w-4" />
    </ToolbarButton>
  );
}
