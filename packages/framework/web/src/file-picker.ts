/**
 * A one-shot file dialog. Opens a throwaway `<input type=file>`, resolves the
 * chosen `File`, or `null` when the dialog is dismissed. Must be called
 * synchronously from a user gesture (a click) or the browser refuses to open it.
 *
 * A `File` is a `Blob`, which is a `BinarySource` everywhere in the stack, so the
 * caller can hand the result straight to the engine — this module stays a pure
 * DOM utility with no EmbedPDF types. It also holds the default provider for
 * the annotation plugin's file prompt ({@link pickRequestedFile}), and its
 * one install per document ({@link installFilePickerProvider}).
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

/** The same dialog with no type filter — any file (attachments). */
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
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The browser's default for a plugin's file prompt (the annotation plugin's
 * `FilePickerProvider`): the file dialog, honouring the request's `accept`
 * filter. A picked `File` carries its own name and type, so it goes straight
 * through as the engine's file source; a dismissed dialog answers `null`.
 */
export async function pickRequestedFile(request: {
  accept?: string | null;
}): Promise<{ data: File } | null> {
  const file = await pickFile({ accept: request.accept ?? '*/*' });
  return file ? { data: file } : null;
}

/** Where a provider goes: the annotation plugin's port (its capability satisfies it). */
export interface FilePickerPort<Provider> {
  /** Install the provider, `null` to make click-then-pick tools do nothing. Returns its removal. */
  setFilePickerProvider(provider: Provider | null): () => void;
}

/** How many mounted installs each document's port has: one is the rule. */
const filePickerInstalls = new WeakMap<object, number>();

/**
 * Install `provider` as a document's file picker, until the call it returns
 * removes it. A document has one port, so a second install while the first
 * is there silently replaces it: `onRepeat` hears of it (an adapter warns in
 * development, saying where to install it once).
 */
export function installFilePickerProvider<Provider>(
  annotation: FilePickerPort<Provider>,
  provider: Provider | null,
  onRepeat: () => void,
): () => void {
  const installed = (filePickerInstalls.get(annotation) ?? 0) + 1;
  filePickerInstalls.set(annotation, installed);
  if (installed > 1) onRepeat();
  const remove = annotation.setFilePickerProvider(provider);
  return () => {
    filePickerInstalls.set(annotation, (filePickerInstalls.get(annotation) ?? 1) - 1);
    remove();
  };
}
