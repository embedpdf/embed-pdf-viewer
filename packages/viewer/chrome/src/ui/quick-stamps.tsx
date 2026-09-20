/**
 * Quick marks in the toolbar: a row of stamp thumbnails that ARM on click —
 * the checkmark, the cross, whatever the embedder configured
 * (`stamps.toolbar`: asset ids, or one library's assets). The hover ghost and
 * the click placement are the annotation plugin's, exactly as from the
 * sidebar; only the picker moved. Renders nothing until the assets exist.
 * Lives in the workspace toolbar, so it reads the ACTIVE document's tool.
 */
import { useEffect } from 'react';
import { InteractionToken } from '@embedpdf/react/interaction';
import { useLocale, useT } from '@embedpdf/react/i18n';
import { useDocumentId, useOptionalSelector } from '@embedpdf/react/runtime';
import {
  StampToken,
  useArmStampAsset,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  type StampAsset,
} from '@embedpdf/react/stamp';
import { useStampsConfig } from '../config-context';
import {
  DEFAULT_LIBRARY_ID,
  ensureDefaultLibrary,
  resolveStampsLocale,
} from '../config/default-stamps';
import { restoreStampLibrariesOnce } from './stamp-store';
import { buttonClass } from './toolbar';

export function QuickStamps() {
  const t = useT();
  const stamp = useStamp();
  const config = useStampsConfig();
  const { locale } = useLocale();
  const assets = useStampAssets();
  const documentId = useDocumentId();
  const { armAsset } = useArmStampAsset();
  const activeToolId = useOptionalSelector(InteractionToken, (c) => c.activeToolId(), null);
  const armedId = useOptionalSelector(
    StampToken,
    (c) => (documentId ? (c.armedAsset(documentId)?.id ?? null) : null),
    null,
  );
  const ids = Array.isArray(config.toolbar)
    ? config.toolbar
    : config.toolbar && 'library' in config.toolbar
      ? (stamp.library(config.toolbar.library)?.assetIds ?? [])
      : [];

  // A quick mark from the built-in library needs that library loaded — the
  // one case the toolbar pays for it at boot. The user's own libraries are
  // restored by the workspace store.
  const wantsDefault = ids.some((id) => id.startsWith(`${DEFAULT_LIBRARY_ID}:`));
  useEffect(() => {
    if (!wantsDefault) return;
    restoreStampLibrariesOnce(stamp)
      .then(() => ensureDefaultLibrary(stamp, resolveStampsLocale(locale), config.defaultLibrary))
      .catch((err) => console.error('[embedpdf] quick stamps failed:', err));
    // `config` is init-stable; only the locale re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, locale, wantsDefault]);

  const shown = ids
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is StampAsset => !!a);
  if (shown.length === 0 || !documentId) return null;
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('demo.quickStampsLabel')}>
      {shown.map((asset) => (
        <QuickStampButton
          key={asset.id}
          asset={asset}
          active={activeToolId === 'stamp' && armedId === asset.id}
          onArm={() =>
            void armAsset(asset.id).catch((e) => console.error('[embedpdf] arm failed', e))
          }
        />
      ))}
    </div>
  );
}

function QuickStampButton({
  asset,
  active,
  onArm,
}: {
  asset: StampAsset;
  active: boolean;
  onArm: () => void;
}) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <button
      type="button"
      onClick={onArm}
      title={asset.label}
      aria-label={asset.label}
      aria-pressed={active || undefined}
      className={buttonClass(active, true)}
    >
      {url ? (
        <img src={url} alt="" className="h-5 w-5 object-contain" draggable={false} />
      ) : (
        <span className="text-xs">{asset.label}</span>
      )}
    </button>
  );
}
