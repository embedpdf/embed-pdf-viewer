import { useDocuments } from '@embedpdf/react/runtime';

export function OpenButton() {
  const documents = useDocuments();

  const onPick = async (file: File) => {
    await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
  };

  return <input type="file" accept="application/pdf" onChange={(e) => onPick(e.target.files![0])} />;
}
