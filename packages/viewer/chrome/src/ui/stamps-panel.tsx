/**
 * The stamps sidebar (right panel) — v2's rubber-stamp sidebar on v3 parts.
 * The stamp plugin owns the libraries, the asset bytes and the cached
 * previews; this panel is the PICKER over them:
 *
 *   a library <select> ("All stamps" + one per library, shown once there
 *   are two) → a two-column grid of thumbnails → click a stamp → `armAsset`
 *   arms the annotation plugin's stamp tool → hovering a page ghosts the
 *   exact placement → each click on a page places one.
 *
 * Deliberately NOT a file dialog: picking arbitrary image bytes is the Image
 * tool's job (a click-then-pick tool, `insert:add-image`). The stamp button
 * opens a library; a library is a set of reusable, named assets — the two
 * gestures are different, so they are different controls.
 *
 * The panel stays open while you place, so a stamp can be dropped on several
 * pages and swapped without a round trip through the toolbar. A command can
 * open it ON a library (`annotation:stamp-from-selection` → "My stamps")
 * through the surface's open props.
 */
import { useEffect, useRef, useState } from 'react';
import { useTool } from '@embedpdf/react/interaction';
import {
  useArmStampAsset,
  useStamp,
  useStampAssetPreviewUrl,
  useStampAssets,
  useStampLibraries,
  type StampAsset,
} from '@embedpdf/react/stamp';
import { useSurface } from '@embedpdf/react/shell';
import { useLocale, useT } from '@embedpdf/react/i18n';
import { useStampsConfig } from '../config-context';
import {
  DEFAULT_LIBRARY_ID,
  ensureDefaultLibrary,
  resolveStampsLocale,
} from '../config/default-stamps';
import { Icon } from './icons';
import { restoreStampLibrariesOnce } from './stamp-store';

const ALL = 'all';

export function StampsPanel() {
  const t = useT();
  const stamp = useStamp();
  const { defaultLibrary, sidebar } = useStampsConfig();
  // Which catalogs this sidebar shows (`stamps.sidebar`): the plain stamps by
  // default — never the people's marks, which have their own panel.
  const libraries = useStampLibraries({ kind: sidebar ?? ['stamps'] });
  const assets = useStampAssets();
  const { armAsset } = useArmStampAsset();
  const { activeToolId } = useTool();
  const { locale } = useLocale();
  const surface = useSurface('stamps');
  const fileRef = useRef<HTMLInputElement>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'loading' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>(ALL);

  // A command opened the panel ON a library (v2's `selectedLibraryId` prop).
  const openedOn = surface.props?.libraryId;
  useEffect(() => {
    if (typeof openedOn === 'string') setPicked(openedOn);
  }, [openedOn]);

  // First open: the user's stored libraries (the workspace store restores
  // them; this only awaits it), THEN the built-in library for this locale —
  // never at viewer boot, so a viewer whose user never opens this panel pays
  // nothing for it. A locale change while open swaps the built-in library;
  // the user's own are untouched.
  useEffect(() => {
    let live = true;
    setBusy('loading');
    restoreStampLibrariesOnce(stamp)
      .then(() => ensureDefaultLibrary(stamp, resolveStampsLocale(locale), defaultLibrary))
      .catch((err: unknown) => {
        console.error('[embedpdf] default stamps failed:', err);
        if (live) setError(t('demo.stampsError'));
      })
      .finally(() => live && setBusy(null));
    return () => {
      live = false;
    };
    // `t` and `defaultLibrary` are init-stable; only the locale re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, locale]);

  // The interaction hub owns tool state: leaving the stamp tool (picking
  // another tool, pressing Escape) un-highlights the gallery.
  useEffect(() => {
    if (activeToolId !== 'stamp') setArmedId(null);
  }, [activeToolId]);

  const arm = (asset: StampAsset) => {
    setError(null);
    setArmedId(asset.id);
    void armAsset(asset.id).catch((err) => {
      console.error('[embedpdf] arm stamp failed:', err);
      setArmedId(null);
      setError(t('demo.stampsArmError'));
    });
  };

  const importPdf = (file: File) => {
    setError(null);
    setBusy('importing');
    // The file name is only a FALLBACK: an Acrobat-authored or previously
    // exported library names itself through its /Title.
    stamp
      .importLibrary(file, { name: file.name.replace(/\.pdf$/i, '') })
      .then((id) => setPicked(id))
      .catch((err) => {
        console.error('[embedpdf] stamp library import failed:', err);
        setError(t('demo.stampsImportError'));
      })
      .finally(() => setBusy(null));
  };

  /** The library as the PDF it is — title, registry, artwork — for Acrobat
   *  or another viewer. */
  const exportPdf = async (libraryId: string, name: string) => {
    const bytes = await stamp.exportLibrary(libraryId).catch(() => null);
    if (!bytes) return;
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'stamps'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // A removed library falls back to "All"; the picker never names a ghost.
  // One library needs no picker: it is simply the selection (so its export
  // button is reachable).
  const selectedId =
    libraries.length === 1
      ? libraries[0].id
      : libraries.some((library) => library.id === picked)
        ? picked
        : ALL;
  const selected = selectedId === ALL ? null : (libraries.find((l) => l.id === selectedId) ?? null);
  const shown = selectedId === ALL ? assets : assets.filter((a) => a.libraryId === selectedId);
  const isDefault = (libraryId: string) => libraryId === DEFAULT_LIBRARY_ID;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {libraries.length > 0 && (
        <div className="border-border-subtle flex items-center gap-1 border-b p-2">
          {libraries.length > 1 ? (
            <select
              value={selectedId}
              onChange={(event) => setPicked(event.target.value)}
              aria-label={t('demo.stampsTitle')}
              className="border-border bg-surface text-fg min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
            >
              <option value={ALL}>{t('demo.stampsAll')}</option>
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-fg-muted min-w-0 flex-1 truncate px-1 text-xs font-semibold uppercase tracking-wide">
              {libraries[0].name}
            </span>
          )}
          {selected && (
            <>
              <button
                type="button"
                onClick={() => exportPdf(selected.id, selected.name)}
                title={t('demo.stampsExportLibrary')}
                className="text-fg-muted hover:text-fg grid h-7 w-7 shrink-0 place-items-center rounded"
              >
                <Icon name="download" size={14} />
              </button>
              {!isDefault(selected.id) && (
                <button
                  type="button"
                  onClick={() => void stamp.deleteLibrary(selected.id)}
                  title={t('demo.stampsRemoveLibrary')}
                  className="text-fg-muted hover:text-fg grid h-7 w-7 shrink-0 place-items-center rounded"
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {busy === 'loading' && shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <div className="border-border-subtle border-t-accent h-6 w-6 animate-spin rounded-full border-2" />
            <p className="text-fg-muted text-sm">{t('demo.stampsLoading')}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <Icon name="rubberStamp" size={32} className="text-fg-muted" />
            <p className="text-fg-muted text-sm">{t('demo.stampsEmpty')}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {shown.map((asset) => (
              <li key={asset.id} className="group relative">
                <StampAssetCell
                  asset={asset}
                  armed={armedId === asset.id}
                  onArm={() => arm(asset)}
                />
                {!isDefault(asset.libraryId) && (
                  <button
                    type="button"
                    onClick={() => void stamp.deleteAsset(asset.id)}
                    title={t('demo.stampsRemoveStamp')}
                    className="bg-surface border-border text-fg-muted hover:text-fg absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border opacity-0 shadow-sm focus:opacity-100 group-hover:opacity-100"
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(error || armedId) && (
        <div
          className={`border-border-subtle shrink-0 border-t px-3 py-2 text-xs ${
            error ? 'text-red-600' : 'text-fg-muted'
          }`}
        >
          {error ?? t('demo.stampsArmedHint')}
        </div>
      )}

      <div className="border-border-subtle shrink-0 border-t p-3">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => fileRef.current?.click()}
          title={t('demo.stampsImportHint')}
          className="border-border text-fg hover:bg-hover flex w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          <Icon name="rubberStampPlus" size={16} />
          {busy === 'importing' ? t('demo.stampsImporting') : t('demo.stampsImport')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = ''; // allow re-picking the same file
            if (file) importPdf(file);
          }}
        />
      </div>
    </div>
  );
}

/** One grid cell: the plugin's cached preview through the object-URL hook
 *  (the DOM resource's lifetime belongs to the framework layer, not the
 *  store). Image only, as v2 — the artwork IS the label; the label is the
 *  tooltip for the curious. */
function StampAssetCell({
  asset,
  armed,
  onArm,
}: {
  asset: StampAsset;
  armed: boolean;
  onArm: () => void;
}) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <button
      type="button"
      onClick={onArm}
      title={asset.label}
      aria-pressed={armed}
      className={`flex aspect-square w-full items-center justify-center rounded-md border p-2 ${
        armed
          ? 'border-accent bg-accent-light ring-accent ring-2'
          : 'border-border-subtle hover:border-border hover:bg-hover'
      }`}
    >
      {url ? (
        <img src={url} alt={asset.label} className="max-h-full max-w-full object-contain" />
      ) : (
        <span className="text-fg truncate text-sm">{asset.label}</span>
      )}
    </button>
  );
}
