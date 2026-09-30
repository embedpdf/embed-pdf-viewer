import { saveFile, useDocuments } from '@embedpdf/react/runtime';

export function SaveButton() {
  const documents = useDocuments();
  return (
    <button onClick={async () => saveFile(await documents.download(), 'reviewed.pdf')}>Save</button>
  );
}
