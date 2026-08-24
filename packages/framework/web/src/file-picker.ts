/**
 * A one-shot file dialog. Opens a throwaway `<input type=file>`, resolves the
 * chosen `File`, or `null` when the dialog is dismissed. MUST be called
 * synchronously from a user gesture (a click) or the browser refuses to open it.
 *
 * A `File` is a `Blob`, which is a `BinarySource` everywhere in the stack, so the
 * caller can hand the result straight to the engine — this module stays a pure
 * DOM utility with no EmbedPDF types.
 */
const IMAGE_ACCEPT = 'image/png,image/jpeg,application/pdf';

export interface PickFileOptions {
  /** The dialog's `accept` filter. Defaults to PNG / JPEG / PDF. */
  accept?: string;
  /** Allow multiple selection (returns the first file). Defaults to false. */
  multiple?: boolean;
}

/** Open the file dialog; resolve the picked file, or null if cancelled. */
export function pickImageFile(options: PickFileOptions = {}): Promise<File | null> {
  const { accept = IMAGE_ACCEPT, multiple = false } = options;
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';

    let settled = false;
    const finish = (value: File | null): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(value);
    };

    // A window refocus means the dialog closed. Give a queued `change` a tick to
    // win, then treat a bare refocus as a cancel — the fallback for browsers that
    // predate the `cancel` event.
    const onFocus = (): void => {
      setTimeout(() => finish(null), 300);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    window.addEventListener('focus', onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

/** The same dialog with NO type filter — any file (attachments). */
export const pickFile = (options: PickFileOptions = {}): Promise<File | null> =>
  pickImageFile({ accept: '*/*', ...options });

/**
 * Hand bytes to the user as a browser download (a one-shot `<a download>`).
 * The DOM half of "download this attachment" — pair with the annotation
 * capability's `downloadAttachment` or the document `attachments.download`.
 */
export function saveFile(bytes: Uint8Array | Blob, name: string, mimeType?: string): void {
  const blob =
    bytes instanceof Blob
      ? bytes
      : new Blob([bytes as BlobPart], { type: mimeType ?? 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
