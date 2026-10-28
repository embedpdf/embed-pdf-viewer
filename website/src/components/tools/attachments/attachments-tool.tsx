'use client';

import type { AnnotationRef, AttachmentRef, DocumentHandle, PageRef } from '@embedpdf/engine';
import {
  Alert02Icon,
  Attachment01Icon,
  Delete02Icon,
  Download04Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useCallback, useEffect, useState } from 'react';

import { DropOverlay, useFilePicker, useWindowFileDrop } from '../shared/drop-zone';
import { baseName, formatSize } from '../shared/files';
import { NextSteps } from '../shared/next-steps';
import { saveBytes } from '../shared/save-file';
import type { OpenFile } from '../shared/single-file';
import { uniqueName, zip } from '../shared/zip';

/** The engine side of saving the PDF, loaded with the engine. */
const loadOpenPdf = () => import('../shared/open-pdf');

/** A file the PDF carries: attached to the whole document, or pinned to a spot on a page. */
type Carried = {
  readonly key: string;
  readonly name: string;
  readonly size: number | null;
  readonly mimeType: string | null;
  readonly description: string | null;
} & (
  | { readonly kind: 'document'; readonly ref: AttachmentRef }
  | {
      readonly kind: 'page';
      readonly ref: AnnotationRef;
      readonly page: PageRef;
      readonly pageNumber: number;
    }
);

/**
 * Every file the PDF carries, the document's first (in name order, as the engine lists them),
 * then the ones pinned to pages, in page order. People don't tell the two kinds apart, so the
 * tool lists both.
 */
async function carriedFiles(doc: DocumentHandle): Promise<Carried[]> {
  const [{ attachments }, { annotations }, { pages }] = await Promise.all([
    doc.attachments.list(),
    doc.annotations.list(),
    doc.pages.list(),
  ]);
  const pageNumbers = new Map(pages.map((page, index) => [page.ref.objectNumber, index + 1]));
  const ofDocument: Carried[] = attachments.map((attachment) => ({
    kind: 'document',
    key: `document:${attachment.name}`,
    ref: attachment.ref,
    name: attachment.name,
    size: attachment.size,
    mimeType: attachment.mimeType,
    description: attachment.description,
  }));
  const onPages: Carried[] = annotations.flatMap((annotation) => {
    if (annotation.subtype !== 'file-attachment' || !annotation.file) return [];
    const pageNumber = pageNumbers.get(annotation.page.objectNumber) ?? 0;
    return [
      {
        kind: 'page',
        key: `page:${annotation.page.objectNumber}:${
          annotation.ref.kind === 'objectNumber'
            ? annotation.ref.objectNumber
            : `base-${annotation.ref.baseIndex}`
        }`,
        ref: annotation.ref,
        page: annotation.page,
        pageNumber,
        name: annotation.file.name || 'Attached file',
        size: annotation.file.size,
        mimeType: annotation.file.mimeType,
        description: annotation.file.description ?? annotation.contents ?? null,
      },
    ];
  });
  onPages.sort((left, right) =>
    left.kind === 'page' && right.kind === 'page' ? left.pageNumber - right.pageNumber : 0,
  );
  return [...ofDocument, ...onPages];
}

/** `XLSX`, `PDF`: what kind of file it is, from its name. */
function kindOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1) : '';
  return extension && extension.length <= 5 ? extension.toUpperCase() : 'File';
}

const SECONDARY_BUTTON =
  'border-ep-border text-ep-navy hover:border-ep-blue hover:text-ep-blue focus-visible:outline-ep-blue inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-[10px] border bg-white px-3.5 font-sans text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const PRIMARY_BUTTON =
  'bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue inline-flex h-[52px] items-center justify-center gap-2.5 rounded-[10px] px-6 font-sans text-base font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-[3px] disabled:opacity-60';
const ICON_BUTTON =
  'text-ep-soft hover:text-ep-navy hover:bg-ep-tint focus-visible:outline-ep-blue inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 disabled:opacity-40';

/**
 * PDF attachments: the files a PDF carries, each with Save, and all of them in one zip; files
 * dropped on the page are attached. People come for one of two things, getting files out or
 * putting them in, so both are there at once. Removing a file can be undone, and the PDF is
 * downloaded only once something changed.
 */
export function AttachmentsTool({ file }: { file: OpenFile }) {
  const doc = file.doc!;
  const [items, setItems] = useState<readonly Carried[] | null>(null);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [changed, setChanged] = useState(false);
  const [undo, setUndo] = useState<{ name: string; opId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<Uint8Array | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const reload = useCallback(async () => {
    try {
      setItems(await carriedFiles(doc));
    } catch {
      setProblem('The files in this PDF couldn’t be read.');
      setItems([]);
    }
  }, [doc]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A removal can be undone for a while, then the offer goes.
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const attach = async (files: File[]) => {
    if (files.length === 0) return;
    setProblem(null);
    setBusy('attach');
    const taken = new Set(
      (items ?? []).filter((item) => item.kind === 'document').map((item) => item.name),
    );
    const names: string[] = [];
    try {
      for (const picked of files) {
        const name = uniqueName(picked.name, taken);
        taken.add(name);
        await doc.attachments.create({ data: picked, name });
        names.push(name);
      }
    } catch {
      setProblem(
        names.length > 0
          ? `Attached ${names.length} of ${files.length} files. The rest couldn’t be attached.`
          : 'The file couldn’t be attached. It may be too large to handle in a browser.',
      );
    }
    if (names.length > 0) {
      setAdded((current) => new Set([...current, ...names]));
      setChanged(true);
      setSaved(null);
      setAnnouncement(`${names.length === 1 ? names[0] : `${names.length} files`} attached.`);
    }
    await reload();
    setBusy(null);
  };

  const dragging = useWindowFileDrop((files) => void attach(files));
  const picker = useFilePicker((files) => void attach(files), { accept: '*/*' });

  const bytesOf = (item: Carried) =>
    item.kind === 'document'
      ? doc.attachments.download(item.ref)
      : doc.page(item.page).annotations.downloadResource(item.ref, 'file');

  const save = async (item: Carried) => {
    setProblem(null);
    setBusy(item.key);
    try {
      saveBytes(await bytesOf(item), item.name, item.mimeType || 'application/octet-stream');
    } catch {
      setProblem(`${item.name} couldn’t be saved. It may be too large to handle in a browser.`);
    }
    setBusy(null);
  };

  const saveAll = async () => {
    if (!items) return;
    setProblem(null);
    setBusy('all');
    try {
      const entries = [];
      for (const item of items) entries.push({ name: item.name, bytes: await bytesOf(item) });
      saveBytes(zip(entries), `${baseName(file.name)} attachments.zip`, 'application/zip');
    } catch {
      setProblem('The files couldn’t be put together. Save them one by one instead.');
    }
    setBusy(null);
  };

  const remove = async (item: Carried) => {
    setProblem(null);
    setBusy(item.key);
    try {
      const { meta } =
        item.kind === 'document'
          ? await doc.attachments.delete(item.ref)
          : await doc.page(item.page).annotations.delete(item.ref);
      setUndo({ name: item.name, opId: meta.opId });
      setChanged(true);
      setSaved(null);
      setAnnouncement(`${item.name} removed.`);
    } catch {
      setProblem(`${item.name} couldn’t be removed.`);
    }
    await reload();
    setBusy(null);
  };

  const undoRemove = async () => {
    if (!undo) return;
    setBusy('undo');
    try {
      await doc.apply({ undoOf: undo.opId });
      setAnnouncement(`${undo.name} is back.`);
    } catch {
      setProblem(`${undo.name} couldn’t be brought back.`);
    }
    setUndo(null);
    await reload();
    setBusy(null);
  };

  const downloadPdf = async () => {
    setProblem(null);
    setBusy('pdf');
    try {
      const { downloadWhole } = await loadOpenPdf();
      const bytes = await downloadWhole(doc);
      saveBytes(bytes, file.name);
      setSaved(bytes);
      setAnnouncement(`${file.name} is downloading.`);
    } catch {
      setProblem('The PDF couldn’t be saved. Try again.');
    }
    setBusy(null);
  };

  if (!items) {
    return (
      <div className="text-ep-soft flex min-h-[160px] items-center justify-center gap-3 font-sans text-sm">
        <span className="border-ep-mistDeep border-t-ep-blue h-5 w-5 animate-spin rounded-full border-2" />
        Reading the files inside…
      </div>
    );
  }

  const count = items.length;
  return (
    <div className="flex flex-col">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {picker.input}
      <DropOverlay visible={dragging} label={`Drop to attach to ${file.name}`} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-4">
        <h2 className="font-display text-ep-navy m-0 text-lg font-bold">
          {count === 0
            ? 'This PDF has no attached files'
            : `This PDF has ${count} attached ${count === 1 ? 'file' : 'files'}`}
        </h2>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={busy !== null}
          onClick={picker.open}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.4} />
          Attach files
        </button>
      </div>

      {count > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {items.map((item) => (
            <li
              key={item.key}
              className="border-ep-border flex items-center gap-3 rounded-2xl border bg-white p-3"
            >
              <span className="bg-ep-mist text-ep-blue inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl">
                <HugeiconsIcon icon={Attachment01Icon} size={20} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-ep-navy m-0 flex flex-wrap items-center gap-2 font-sans text-[15px] font-bold">
                  <span className="min-w-0 truncate" title={item.name}>
                    {item.name}
                  </span>
                  {item.kind === 'document' && added.has(item.name) && (
                    <span className="bg-ep-mist text-ep-blue700 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]">
                      New
                    </span>
                  )}
                </p>
                <p className="text-ep-soft m-0 mt-0.5 font-sans text-[13px]">
                  {kindOf(item.name)}
                  {item.size !== null && `, ${formatSize(item.size)}`}
                  {item.kind === 'page' && `, on page ${item.pageNumber}`}
                </p>
                {item.description && (
                  <p className="text-ep-muted m-0 mt-1 line-clamp-2 font-sans text-[13px]">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void save(item)}
                disabled={busy !== null}
                className={SECONDARY_BUTTON}
              >
                {busy === item.key ? (
                  <span className="border-ep-mistDeep border-t-ep-blue h-4 w-4 animate-spin rounded-full border-2" />
                ) : (
                  <HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={2.2} />
                )}
                <span className="max-[480px]:sr-only">Save</span>
              </button>
              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={busy !== null}
                aria-label={`Remove ${item.name}`}
                className={`${ICON_BUTTON} hover:!text-[#B42318]`}
              >
                <HugeiconsIcon icon={Delete02Icon} size={18} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={picker.open}
        disabled={busy !== null}
        className={`border-ep-mistDeep text-ep-blue hover:border-ep-blue hover:bg-ep-tint focus-visible:outline-ep-blue flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-sans text-sm font-bold transition-colors focus-visible:outline-2 disabled:opacity-50 ${
          count === 0 ? 'min-h-[140px] flex-col' : 'mt-2.5 h-14'
        }`}
      >
        {busy === 'attach' ? (
          <span className="border-ep-mistDeep border-t-ep-blue h-4 w-4 animate-spin rounded-full border-2" />
        ) : (
          <HugeiconsIcon icon={PlusSignIcon} size={18} strokeWidth={2.4} />
        )}
        {count === 0
          ? 'Drop files here to attach them, or choose them'
          : 'Attach more files, or drop them anywhere on the page'}
      </button>

      {undo && (
        <div
          role="status"
          className="bg-ep-navy mt-3 flex items-center justify-between gap-3 rounded-xl px-4 py-3 font-sans text-sm text-white"
        >
          <span className="min-w-0 truncate">Removed {undo.name}</span>
          <button
            type="button"
            onClick={() => void undoRemove()}
            disabled={busy !== null}
            className="font-bold text-[#7BB2FF] hover:text-white"
          >
            Undo
          </button>
        </div>
      )}

      {problem && (
        <p
          role="alert"
          className="m-0 mt-3 flex items-start gap-2 font-sans text-sm text-[#B42318]"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            size={18}
            strokeWidth={2}
            className="mt-px flex-shrink-0"
          />
          {problem}
        </p>
      )}

      {(changed || count >= 2) && (
        <div className="border-ep-border sticky bottom-0 z-[3] -mx-[clamp(14px,2.2vw,24px)] -mb-[clamp(14px,2.2vw,24px)] mt-5 flex flex-col-reverse gap-2 rounded-b-[22px] border-t bg-white/95 px-[clamp(14px,2.2vw,24px)] py-3.5 backdrop-blur min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-end min-[641px]:gap-3">
          {count >= 2 && (
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={busy !== null}
              className={changed ? `${SECONDARY_BUTTON} h-[52px] justify-center` : PRIMARY_BUTTON}
            >
              <HugeiconsIcon icon={Download04Icon} size={18} strokeWidth={2.2} />
              {busy === 'all' ? 'Putting them together…' : 'Save all files (.zip)'}
            </button>
          )}
          {changed && (
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={busy !== null}
              className={PRIMARY_BUTTON}
            >
              <HugeiconsIcon icon={Download04Icon} size={20} strokeWidth={2.2} />
              {busy === 'pdf' ? 'Saving…' : 'Download PDF'}
            </button>
          )}
        </div>
      )}

      {saved && (
        <div className="mt-8">
          <NextSteps
            file={{ name: file.name, bytes: saved, password: file.password }}
            from="pdf-attachment-editor"
          />
        </div>
      )}
    </div>
  );
}
