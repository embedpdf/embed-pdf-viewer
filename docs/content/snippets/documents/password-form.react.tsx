import { useState } from 'react';
import { useDocuments, type DocumentInfo } from '@embedpdf/react/runtime';
import { PasswordPrompt } from './PasswordPrompt';

export function PasswordForm({ document }: { document: DocumentInfo }) {
  const documents = useDocuments();
  const [wrong, setWrong] = useState(false);

  const submit = async (password: string) => {
    try {
      await documents.unlock(document.id, { password });
    } catch {
      setWrong(true); // it stays locked; ask again
    }
  };

  return <PasswordPrompt onSubmit={submit} wrong={wrong} />;
}
