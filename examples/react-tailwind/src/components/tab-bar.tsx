type TabBarProps = {
  documentStates: any[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onOpenFile: () => void;
};

export function TabBar({
  documentStates,
  activeDocumentId,
  onSelect,
  onClose,
  onOpenFile,
}: TabBarProps) {
  return (
    <div className="flex items-center border-b border-gray-200 bg-gray-50">
      {/* Document Tabs */}
      <div className="flex flex-1 overflow-x-auto">
        {documentStates.map((document) => (
          <div
            key={document.id}
            onClick={() => onSelect(document.id)}
            role="tab"
            tabIndex={0}
            aria-selected={activeDocumentId === document.id}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(document.id);
              }
            }}
            className={`group relative flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeDocumentId === document.id
                ? 'border-blue-500 bg-white text-blue-600'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-800'
            } `}
          >
            {/* Document Icon */}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>

            {/* Document Name */}
            <span className="max-w-[150px] truncate">
              {(() => {
                const doc = document.document as unknown;
                const hasName = !!doc && typeof doc === 'object' && 'name' in (doc as object);
                const name = hasName ? (doc as { name?: string }).name : undefined;
                return name ?? `Document ${document.id.slice(0, 8)}`;
              })()}
            </span>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(document.id);
              }}
              aria-label={`Close ${(() => {
                const doc = document.document as unknown;
                const hasName = !!doc && typeof doc === 'object' && 'name' in (doc as object);
                return hasName ? ((doc as { name?: string }).name ?? 'document') : 'document';
              })()}`}
              className="ml-2 rounded p-0.5 opacity-0 transition-opacity hover:bg-gray-200 group-hover:opacity-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Open File Button */}
      <button
        onClick={onOpenFile}
        className="flex items-center gap-2 border-l border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Open File</span>
      </button>
    </div>
  );
}
