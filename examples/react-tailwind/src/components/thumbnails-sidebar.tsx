import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { CloseIcon } from './icons';

type ThumbnailsSidebarProps = {
  documentId: string;
  onClose: () => void;
};

export function ThumbnailsSidebar({ documentId, onClose }: ThumbnailsSidebarProps) {
  const { state, provides } = useScroll(documentId);

  return (
    <div className="flex h-full w-56 flex-col border-r border-gray-300 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-300 bg-white px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-800">Thumbnails</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close thumbnails"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Thumbnails */}
      <div className="flex-1 overflow-hidden">
        <ThumbnailsPane documentId={documentId} style={{ width: '100%', height: '100%' }}>
          {(m) => (
            <div
              key={m.pageIndex}
              style={{
                position: 'absolute',
                width: '100%',
                height: m.wrapperHeight,
                top: m.top,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                padding: '8px',
              }}
              onClick={() => {
                provides?.scrollToPage?.({
                  pageNumber: m.pageIndex + 1,
                });
              }}
            >
              <div
                style={{
                  width: m.width,
                  height: m.height,
                  border: `2px solid ${state.currentPage === m.pageIndex + 1 ? '#3b82f6' : '#d1d5db'}`,
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow:
                    state.currentPage === m.pageIndex + 1
                      ? '0 0 0 2px rgba(59, 130, 246, 0.2)'
                      : 'none',
                }}
              >
                <ThumbImg
                  documentId={documentId}
                  meta={m}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <div
                style={{
                  height: m.labelHeight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '4px',
                }}
              >
                <span className="text-xs text-gray-600">{m.pageIndex + 1}</span>
              </div>
            </div>
          )}
        </ThumbnailsPane>
      </div>
    </div>
  );
}
