import { useDocumentsEvent } from '@embedpdf/react/runtime';

export function TitleDot() {
  useDocumentsEvent(
    (documents) => documents.onUnsavedChangesChanged,
    ({ hasUnsavedChanges }) => {
      document.title = hasUnsavedChanges ? '● Contract' : 'Contract';
    },
  );

  return null;
}
