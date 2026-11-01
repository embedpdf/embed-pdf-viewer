/**
 * The attachments panel: the files the document carries, its attachments first, then the files
 * pinned to its pages. A row shows the file's kind, its name (without the characters that can
 * disguise one), its size and description, and a page's file says its page. Clicking an
 * attachment saves it; clicking a page's file goes to it. A row's menu saves, goes to the page
 * and deletes. A session that may add files adds one with the button in the panel's bar
 * (`attachments` in the layout, beside the count), or drops files on the panel; a drop there
 * never opens them as documents.
 */
import {
  displayNameOf,
  useAttachment,
  useAttachmentState,
  type AttachedFile,
} from '@embedpdf/react/attachment';
import { useCommand, useCommands } from '@embedpdf/react/commands';
import { useI18nSettings, useT } from '@embedpdf/react/i18n';
import { usePageList } from '@embedpdf/react/runtime';
import { useMemo, useRef, useState, type DragEvent } from 'react';

import { useLayoutEnv } from '../config-context';
import { Icon, type IconName } from './icons';
import { useCloseOnPick } from './panel-frame';
import { CommandButton } from './toolbar';
import type { AttachmentAddArgs } from '../config/attachments';

/** A file's size in the viewer's language: bytes, then kB and MB with one decimal. */
function sizeText(bytes: number, locale: string | undefined): string {
  const [value, unit] =
    bytes < 1000
      ? [bytes, 'byte']
      : bytes < 1_000_000
        ? [bytes / 1000, 'kilobyte']
        : [bytes / 1_000_000, 'megabyte'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value);
}

/** The icon for a file's kind, by its type. */
function iconOf(file: AttachedFile): IconName {
  const type = file.mimeType ?? '';
  if (type === 'application/pdf') return 'file';
  if (type.startsWith('image/')) return 'photo';
  return 'paperclip';
}

/** Whether a drag carries files: what the panel takes. */
const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

export function AttachmentsPanel() {
  const t = useT();
  const locale = useI18nSettings((settings) => settings.locale) ?? undefined;
  const attachment = useAttachment();
  const { files, selected, status } = useAttachmentState();
  const commands = useCommands();
  const add = useCommand('attachment:add');
  const closeOnPick = useCloseOnPick();
  const pages = usePageList();
  const canAdd = add.visible && add.enabled;
  // A drag enters and leaves every element it crosses: count them, so the target stays until
  // the drag leaves the panel.
  const entered = useRef(0);
  const [dropping, setDropping] = useState(false);

  const pageLabelOf = useMemo(() => {
    const byKey = new Map(pages.map((page) => [page.ref.objectNumber, page]));
    return (file: AttachedFile): string | null => {
      if (file.home.kind !== 'page') return null;
      const page = byKey.get(file.home.ref.page.objectNumber);
      return page ? (page.label ?? String(page.index + 1)) : null;
    };
  }, [pages]);
  const selectedIds = new Set(selected.map((file) => file.id));

  /** A click on a row: an attachment saves, a page's file goes to its page. */
  const pick = (file: AttachedFile) => {
    attachment.select([file]);
    if (file.home.kind === 'page') {
      attachment.reveal(file);
      closeOnPick();
      return;
    }
    // A failing command reports itself through the commands' onExecutionFailed.
    void commands.execute('attachment:save').catch(() => {});
  };

  const dropProps = canAdd
    ? {
        onDragEnter: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          entered.current += 1;
          setDropping(true);
        },
        onDragOver: (event: DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: () => {
          if (entered.current === 0) return;
          entered.current -= 1;
          if (entered.current === 0) setDropping(false);
        },
        onDrop: (event: DragEvent) => {
          entered.current = 0;
          setDropping(false);
          if (!carriesFiles(event)) return;
          // The panel's drop: the files are attached, never opened as documents.
          event.preventDefault();
          event.stopPropagation();
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length === 0) return;
          const args: AttachmentAddArgs = { files: dropped };
          void commands.execute('attachment:add', { args }).catch(() => {});
        },
      }
    : {};

  const message = (text: string, withAdd = false) => (
    <div className="text-fg-muted flex flex-col items-center gap-3 p-6 text-center text-sm">
      <p>{text}</p>
      {withAdd && canAdd && (
        <button
          type="button"
          onClick={() => void add.run()}
          className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
        >
          {add.label}
        </button>
      )}
      {withAdd && canAdd && <p className="text-xs">{t('attachments.dropHint')}</p>}
    </div>
  );

  const body = (() => {
    if (files.length === 0) {
      if (status === 'idle' || status === 'loading') return message(t('attachments.loading'));
      if (status === 'forbidden' || status === 'error') return message(t('attachments.failed'));
      return message(t('attachments.empty'), true);
    }
    return (
      <ul aria-label={t('panels.attachments')} className="min-h-0 flex-1 overflow-y-auto p-1">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            page={pageLabelOf(file)}
            selected={selectedIds.has(file.id)}
            pending={attachment.isPending(file)}
            locale={locale}
            onPick={() => pick(file)}
            onMenu={() => attachment.select([file])}
          />
        ))}
      </ul>
    );
  })();

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...dropProps}>
      {body}
      {dropping && (
        <div className="border-accent bg-accent/10 text-fg pointer-events-none absolute inset-1 flex items-center justify-center rounded-md border-2 border-dashed text-sm">
          {t('attachments.drop')}
        </div>
      )}
    </div>
  );
}

interface FileRowProps {
  readonly file: AttachedFile;
  /** The page a page's file is on, as the document labels it; null for an attachment. */
  readonly page: string | null;
  readonly selected: boolean;
  /** Its add waits for the engine. */
  readonly pending: boolean;
  /** The viewer's language, for sizes; the browser's when it has none. */
  readonly locale: string | undefined;
  readonly onPick: () => void;
  /** Its menu is about to open: the row's file becomes the selection the menu acts on. */
  readonly onMenu: () => void;
}

function FileRow({ file, page, selected, pending, locale, onPick, onMenu }: FileRowProps) {
  const t = useT();
  // A finger has no hover: the menu button shows on every row.
  const { touch } = useLayoutEnv();
  const menuButton = useRef<HTMLSpanElement>(null);
  const name = displayNameOf(file);
  const details = [
    pending ? t('attachments.adding') : file.size === null ? null : sizeText(file.size, locale),
    page === null ? null : t('attachments.onPage', { params: { page } }),
    file.description,
  ].filter((part): part is string => !!part);

  return (
    <li
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu();
        menuButton.current?.querySelector('button')?.click();
      }}
      className={`group flex items-center gap-1 rounded pe-1 ${
        selected ? 'bg-accent/10' : 'hover:bg-hover'
      } ${pending ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={onPick}
        title={name}
        className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-start"
      >
        <Icon name={iconOf(file)} size={16} className="text-fg-muted shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-fg block truncate text-sm">
            <bdi>{name}</bdi>
          </span>
          {details.length > 0 && (
            <span className="text-fg-muted block truncate text-xs">{details.join(' · ')}</span>
          )}
        </span>
      </button>
      <span
        ref={menuButton}
        onClick={(event) => event.stopPropagation()}
        onPointerDownCapture={onMenu}
        className={`shrink-0 ${
          selected || touch ? '' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
        }`}
      >
        <RowMenuButton />
      </span>
    </li>
  );
}

/** A row's menu button: the attachment commands for the selected file. */
function RowMenuButton() {
  const more = useCommand('menu:attachment-item');
  if (!more.visible) return null;
  return <CommandButton cmd={more} variant="icon" run={() => void more.run()} />;
}
