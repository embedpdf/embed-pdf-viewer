import { ReactNode } from '@framework';
import { useDocumentState } from '../hooks';
import { DocumentState } from '@embedpdf/core';

export interface DocumentContentRenderProps {
  documentState: DocumentState;
  isLoading: boolean;
  isError: boolean;
  isLoaded: boolean;
}

interface DocumentContentProps {
  documentId: string | null;
  children: (props: DocumentContentRenderProps) => ReactNode;
}

/**
 * Headless component for rendering document content with loading/error states
 *
 * @example
 * <DocumentContent documentId={activeDocumentId}>
 *   {({ document, isLoading, isError, isLoaded }) => {
 *     if (isLoading) return <LoadingSpinner />;
 *     if (isError) return <ErrorMessage />;
 *     if (isLoaded) return <PDFViewer document={document} />;
 *     return null;
 *   }}
 * </DocumentContent>
 */
export function DocumentContent({ documentId, children }: DocumentContentProps) {
  const documentState = useDocumentState(documentId);

  if (!documentState) return null;

  const isLoading = documentState.status === 'loading';
  const isError = documentState.status === 'error';
  const isLoaded = documentState.status === 'loaded';

  return <>{children({ documentState, isLoading, isError, isLoaded })}</>;
}
