import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';

interface EmptyStateProps {
  onDocumentOpened?: (documentId: string) => void;
}

export function EmptyState({ onDocumentOpened }: EmptyStateProps) {
  const { provides } = useDocumentManagerCapability();

  const handleOpenFile = () => {
    const openTask = provides?.openFileDialog();
    openTask?.wait(
      (result) => {
        onDocumentOpened?.(result.documentId);
      },
      (error) => {
        console.error('Open file failed:', error);
      },
    );
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-indigo-100 p-6">
            <svg
              className="h-16 w-16 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-6 4h6"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-3 text-2xl font-bold text-gray-900">No Documents Open</h2>
        <p className="mb-8 text-gray-600">
          Get started by opening a PDF document. You can view multiple documents at once using tabs.
        </p>
        <button
          onClick={handleOpenFile}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Open PDF Document
        </button>
        <div className="mt-6 text-sm text-gray-500">Supported format: PDF</div>
      </div>
    </div>
  );
}
