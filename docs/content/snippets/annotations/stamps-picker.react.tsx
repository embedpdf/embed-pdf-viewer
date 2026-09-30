import { useStamp, useStampAssets } from '@embedpdf/react/stamp';

import { StampPreview } from './stamps-preview';

export function StampPicker({ libraryId }: { libraryId: string }) {
  const stamp = useStamp();
  const assets = useStampAssets({ libraryId });

  return assets.map((asset) => (
    <button key={asset.id} onClick={() => stamp.armAsset(asset.id)}>
      <StampPreview assetId={asset.id} />
      {asset.label}
    </button>
  ));
}
