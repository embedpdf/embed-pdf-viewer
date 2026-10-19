import { useRouter } from 'next/navigation';
import { useDocumentsEvent } from '@embedpdf/react/runtime';

export function DocumentRoute() {
  const router = useRouter();

  useDocumentsEvent(
    (documents) => documents.onActiveChanged,
    ({ documentId }) => router.replace(`/documents/${documentId}`),
  );

  return null;
}
