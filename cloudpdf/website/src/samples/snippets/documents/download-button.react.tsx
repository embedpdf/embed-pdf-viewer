import { saveFile, useDocuments } from '@embedpdf/react/runtime';

export function DownloadButton() {
  const documents = useDocuments();
  return (
    <button onClick={async () => saveFile(await documents.download(), 'contract.pdf')}>
      Download
    </button>
  );
}
