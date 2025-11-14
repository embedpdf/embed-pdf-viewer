import { useState, useEffect } from '@framework';
import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { ScrollPlugin, ScrollScope } from '@embedpdf/plugin-scroll';

export const useScrollPlugin = () => usePlugin<ScrollPlugin>(ScrollPlugin.id);
export const useScrollCapability = () => useCapability<ScrollPlugin>(ScrollPlugin.id);

// Define the return type explicitly to maintain type safety
interface UseScrollReturn {
  provides: ScrollScope | null;
  state: {
    currentPage: number;
    totalPages: number;
  };
}

export const useScroll = (documentId: string): UseScrollReturn => {
  const { provides } = useScrollCapability();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!provides || !documentId) return;

    const scope = provides.forDocument(documentId);
    setCurrentPage(scope.getCurrentPage());
    setTotalPages(scope.getTotalPages());

    return provides.onPageChange((event) => {
      if (event.documentId === documentId) {
        setCurrentPage(event.pageNumber);
        setTotalPages(event.totalPages);
      }
    });
  }, [provides, documentId]);

  return {
    // New format (preferred)
    provides: provides?.forDocument(documentId) ?? null,
    state: {
      currentPage,
      totalPages,
    },
  };
};
