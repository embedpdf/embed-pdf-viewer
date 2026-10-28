'use client';

import type { Viewer } from '@embedpdf/viewer-react';
import { Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';

import { NextSteps } from '../shared/next-steps';
import { saveBytes } from '../shared/save-file';
import type { OpenFile } from '../shared/single-file';

const ToolViewer = dynamic(
  () => import('../shared/tool-viewer').then((module) => module.ToolViewer),
  {
    ssr: false,
    loading: () => (
      <div className="text-ep-soft flex h-full items-center justify-center gap-3 font-sans text-sm">
        <span className="border-ep-mistDeep border-t-ep-blue h-5 w-5 animate-spin rounded-full border-2" />
        Opening the pages…
      </div>
    ),
  },
);

/**
 * What the bookmark editor doesn't need. What stays: the bookmarks (outline) with editing, page
 * thumbnails and search to find a place, and text selection, because a selected heading becomes
 * a new bookmark's title.
 */
const DISABLED = [
  'annotations',
  'shapes',
  'stamps',
  'comments',
  'forms',
  'signatures',
  'redaction',
  'measurement',
  'attachments',
  'pages',
];

/** The viewer says "outline" and "item"; people who come here say "bookmarks". */
const STRINGS = {
  en: {
    panels: { outline: 'Bookmarks' },
    commands: {
      outline: {
        add: 'Add bookmark',
        addChild: 'Add bookmark inside',
        setDestination: 'Point it at the current view',
      },
    },
    outline: {
      empty:
        'No bookmarks yet. Go to a page and press Add bookmark. Select a heading first to use it as the title.',
      filter: 'Filter bookmarks',
      noMatches: 'No bookmarks match',
      untitled: 'New bookmark',
    },
  },
};

/**
 * Edit PDF bookmarks: the file in the EmbedPDF viewer with its bookmarks panel open, where adding
 * one happens next to the page it goes to. Add bookmark uses the selected text as the title and
 * the place in view as where it goes, the way Acrobat's New Bookmark does.
 */
export function BookmarksTool({ file }: { file: OpenFile }) {
  const viewer = useRef<Viewer | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<Uint8Array | null>(null);

  const download = async () => {
    if (!viewer.current) return;
    setSaving(true);
    setProblem(null);
    try {
      const bytes = await viewer.current.documents.download();
      saveBytes(bytes, file.name);
      setSaved(bytes);
    } catch {
      setProblem('The PDF couldn’t be saved. Try again.');
    }
    setSaving(false);
  };

  return (
    <div data-tool-wide className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ep-muted m-0 min-w-0 flex-1 basis-[280px] font-sans text-sm leading-[1.5]">
          Go to a page and press <b className="text-ep-navy">Add bookmark</b>. Select a heading
          first to use it as the title. Drag bookmarks to reorder or nest them.
        </p>
        <button
          type="button"
          onClick={() => void download()}
          disabled={saving}
          className="bg-ep-blue hover:bg-ep-blue600 focus-visible:outline-ep-blue inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-[10px] px-5 font-sans text-sm font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          <HugeiconsIcon icon={Download04Icon} size={18} strokeWidth={2.2} />
          {saving ? 'Saving…' : 'Download'}
        </button>
      </div>
      {problem && (
        <p role="alert" className="m-0 font-sans text-sm text-[#B42318]">
          {problem}
        </p>
      )}
      <div className="border-ep-border h-[min(78svh,820px)] min-h-[480px] overflow-hidden rounded-2xl border">
        <ToolViewer
          name={file.name}
          bytes={file.bytes}
          password={file.password}
          disable={DISABLED}
          panel="outline"
          strings={STRINGS}
          onViewer={(ready) => {
            viewer.current = ready;
          }}
        />
      </div>
      {saved && (
        <div className="mt-6">
          <NextSteps
            file={{ name: file.name, bytes: saved, password: file.password }}
            from="pdf-outline-editor"
          />
        </div>
      )}
    </div>
  );
}
