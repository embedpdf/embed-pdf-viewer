import { View } from '@embedpdf/plugin-view-manager';

export interface ViewContextRenderProps {
  view: View;
  documentIds: string[];
  activeDocumentId: string | null;
  isFocused: boolean;
  addDocument: (documentId: string, index?: number) => void;
  removeDocument: (documentId: string) => void;
  setActiveDocument: (documentId: string | null) => void;
  moveDocumentWithinView: (documentId: string, index: number) => void;
  focus: () => void;
}
