import { useMetadataState } from '@embedpdf/react/metadata';

export function ContractNumber() {
  const { custom } = useMetadataState(); // { contractId: 'C-2026-114', reviewedBy: 'dana' }

  return <span>Contract {custom?.contractId}</span>;
}
