import { displayNameOf, useAttachment, useAttachmentState } from '@embedpdf/react/attachment';
import type { AttachedFile } from '@embedpdf/react/attachment';
import { saveFile } from '@embedpdf/react/runtime';

export function AttachmentList() {
  const attachment = useAttachment();
  const { files, canDownload } = useAttachmentState();

  const save = async (file: AttachedFile) => {
    const { bytes, name, mimeType } = await attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  };

  return (
    <ul>
      {files.map((file) => (
        <li key={file.id}>
          <bdi>{displayNameOf(file)}</bdi>
          <button disabled={!canDownload} onClick={() => save(file)}>
            Save
          </button>
        </li>
      ))}
    </ul>
  );
}
