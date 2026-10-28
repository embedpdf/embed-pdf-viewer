import {
  EngineError,
  EngineErrorCode,
  type DocumentHandle,
  type Engine,
  type OutlineItemRef,
  type PageRef,
} from '@embedpdf/engine';

import { blankPdf } from './blank-pdf';
import { outlineCopy } from './outline-copy';
import { baseName } from '../shared/files';
import { downloadWhole, openPdf } from '../shared/open-pdf';

/** A first-page picture for a file's row; `revoke` frees it when the row goes. */
export interface Thumbnail {
  readonly url: string;
  readonly revoke: () => void;
}

/** What a dropped PDF turned out to be. */
export type Inspection =
  | {
      readonly kind: 'ready';
      readonly pageCount: number;
      readonly thumbnail: Thumbnail | null;
      /** It holds a signature, which the merged file can't keep valid. */
      readonly signed: boolean;
    }
  | { readonly kind: 'locked'; readonly incorrect: boolean }
  | { readonly kind: 'unreadable' };

/** One file to merge, in order. */
export interface MergeFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly password?: string;
  /** The pages to merge, 0-based and in order; every page when left out. */
  readonly pages?: readonly number[];
}

export interface MergeOptions {
  /** Put each file's pages, and its own bookmarks, under a bookmark named after the file. */
  readonly bookmarkEachFile: boolean;
}

export interface MergeResult {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
}

const THUMBNAIL_WIDTH = 120;

/** The page picker's pages: wide enough to stay sharp at twice the size they're shown. */
const PICKER_THUMBNAIL_WIDTH = 180;

/**
 * Open with a copy: the browser engine takes over the buffer it's given, and the row keeps its
 * bytes for the merge.
 */
const openCopy = (engine: Engine, bytes: Uint8Array, password?: string) =>
  engine.open({ kind: 'bytes', bytes: bytes.slice() }, password ? { password } : undefined);

/**
 * Read what the row shows: the page count and the first page, or that the file needs its
 * password (`incorrect` once a wrong one was tried), or that it can't be read at all.
 */
export async function inspectPdf(
  engine: Engine,
  bytes: Uint8Array,
  password?: string,
): Promise<Inspection> {
  const opened = await openPdf(engine, bytes, password);
  if (opened.kind !== 'ready') return opened;
  const { doc, pageCount, signed } = opened;
  try {
    const [first] = (await doc.pages.list()).pages;
    const thumbnail = await doc
      .page(first!.ref)
      .render.image({ viewport: { kind: 'width', width: THUMBNAIL_WIDTH }, format: 'webp' })
      .then((image) => image.objectUrl())
      .catch(() => null);
    return { kind: 'ready', pageCount, thumbnail, signed };
  } finally {
    await doc.close().catch(() => {});
  }
}

/** A file held open while its pages are chosen: how many there are, and a picture of each. */
export interface PageSource {
  readonly pageCount: number;
  thumbnail(index: number): Promise<Thumbnail | null>;
  close(): Promise<void>;
}

/** Open a file for the page picker; close it when the picker closes. */
export async function openPageSource(
  engine: Engine,
  bytes: Uint8Array,
  password?: string,
): Promise<PageSource> {
  const doc = await openCopy(engine, bytes, password);
  const { pages, pageCount } = await doc.pages.list();
  return {
    pageCount,
    thumbnail: (index) => {
      const page = pages[index];
      if (!page) return Promise.resolve(null);
      return doc
        .page(page.ref)
        .render.image({
          viewport: { kind: 'width', width: PICKER_THUMBNAIL_WIDTH },
          format: 'webp',
        })
        .then((image) => image.objectUrl())
        .catch(() => null);
    },
    close: () => doc.close().catch(() => {}),
  };
}

/**
 * The pages to insert for a file: the file itself, or a copy of the chosen pages. A file behind a
 * password is always copied, after unlocking it: an insert can't unlock.
 */
async function insertable(
  source: DocumentHandle,
  file: MergeFile,
  pages: readonly PageRef[],
  whole: boolean,
) {
  if (whole && !file.password) return file.bytes.slice();
  return source.pages.extract([...pages]);
}

/** Append one file's chosen pages to `merged`, and the bookmarks to them after them. */
async function appendFile(
  engine: Engine,
  merged: DocumentHandle,
  file: MergeFile,
  options: MergeOptions,
): Promise<void> {
  const source = await openCopy(engine, file.bytes, file.password);
  try {
    const allPages = (await source.pages.list()).pages.map((page) => page.ref);
    const sourcePages = file.pages
      ? file.pages.flatMap((index) => (allPages[index] ? [allPages[index]] : []))
      : allPages;
    if (sourcePages.length === 0) return;
    const { items } = await source.outline.get();
    let bytes = await insertable(source, file, sourcePages, sourcePages.length === allPages.length);
    let inserted: readonly PageRef[];
    try {
      ({ insertedPages: inserted } = await merged.pages.insert(bytes));
    } catch (error) {
      // A file that only has an owner password opens without asking, but an insert reads it
      // without one: copy its pages out through the open document instead.
      if (!EngineError.is(error, EngineErrorCode.DocPasswordRequired)) throw error;
      bytes = await source.pages.extract(sourcePages);
      ({ insertedPages: inserted } = await merged.pages.insert(bytes));
    }

    let top: OutlineItemRef | null = null;
    if (options.bookmarkEachFile && inserted[0]) {
      const { item } = await merged.outline.create({
        title: baseName(file.name),
        target: { kind: 'goto', destination: { kind: 'fit', page: inserted[0] } },
      });
      top = item.ref;
    }
    const copies = new Map<number, OutlineItemRef>();
    for (const step of outlineCopy(items, sourcePages, inserted)) {
      const parent = step.parent ? (copies.get(step.parent.objectNumber) ?? top) : top;
      const { item } = await merged.outline.create(step.draft, parent ? { parent } : undefined);
      copies.set(step.source.objectNumber, item.ref);
    }
  } finally {
    await source.close().catch(() => {});
  }
}

/**
 * Merge the files in order into one new PDF. Each file's pages keep their annotations and form
 * fields, and its bookmarks are copied over. The result is written whole (`'rewrite'`), so it
 * carries nothing of the blank page it was built on, unless a signed file's signature came along:
 * then the engine refuses a rewrite (it would void the signature) and the merge saves
 * incrementally. The signature can't stay valid either way, since its bytes changed; the row
 * said so before the merge.
 */
export async function mergePdfs(
  engine: Engine,
  files: readonly MergeFile[],
  options: MergeOptions,
  onProgress?: (done: number) => void,
): Promise<MergeResult> {
  const merged = await engine.open({ kind: 'bytes', bytes: blankPdf() });
  try {
    const blank = (await merged.pages.list()).pages[0]!.ref;
    for (const [index, file] of files.entries()) {
      await appendFile(engine, merged, file, options);
      onProgress?.(index + 1);
    }
    await merged.pages.delete([blank]);
    const now = new Date();
    await merged.metadata.update({ createdAt: now, modifiedAt: now });
    const { pageCount } = await merged.pages.list();
    const bytes = await downloadWhole(merged);
    return { bytes, pageCount };
  } finally {
    await merged.close().catch(() => {});
  }
}
