import { useRedactionCapability } from '@embedpdf/plugin-redaction/preact';

export function useRedaction(documentId: string) {
  const { provides: redactionCapability } = useRedactionCapability();

  const searchText = async (text: string, caseSensitive: boolean = false) => {
    const redaction = redactionCapability?.forDocument(documentId);
    if (!redaction) {
      throw new Error('Redaction capability not available');
    }
    return await redaction.searchText(text, caseSensitive).toPromise();
  };

  const redactText = async (text: string, caseSensitive: boolean = false) => {
    const redaction = redactionCapability?.forDocument(documentId);
    if (!redaction) {
      throw new Error('Redaction capability not available');
    }
    return await redaction.redactText(text, caseSensitive).toPromise();
  };

  return {
    searchText,
    redactText,
  };
}