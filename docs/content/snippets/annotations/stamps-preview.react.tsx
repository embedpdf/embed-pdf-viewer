import { useStampAssetPreviewUrl } from '@embedpdf/react/stamp';

export function StampPreview({ assetId }: { assetId: string }) {
  const url = useStampAssetPreviewUrl(assetId);
  return url ? <img src={url} alt="" /> : null;
}
