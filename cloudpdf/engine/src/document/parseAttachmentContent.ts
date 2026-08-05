import {
  EngineError,
  EngineErrorCode,
  type AttachmentContent,
} from '@embedpdf/engine-core/runtime';
import { decodeTokenText } from '@embedpdf/engine-core/wire';

import type { HttpFileResponse } from '../transport/HttpClient';

/** Header carrying the file's name, token-text encoded (names are
 *  arbitrary UTF-8; HTTP header values are not). */
const FILE_NAME_HEADER = 'X-EmbedPDF-File-Name';

/**
 * Project an attachment-file response into `AttachmentContent`. The body
 * IS the decoded bytes; the metadata rides as headers — `Content-Type`
 * for the declared mime type, `X-EmbedPDF-File-Name` for the file name.
 * Shared by the document-level `attachments.download()` and the
 * annotation-level `annotations.downloadFile()` reads — one wire shape
 * for both homes a file can live in.
 */
export function parseAttachmentContent(file: HttpFileResponse): AttachmentContent {
  const encodedName = file.headers.get(FILE_NAME_HEADER);
  if (encodedName === null) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `attachment response missing ${FILE_NAME_HEADER} header`,
    );
  }
  let name: string;
  try {
    name = decodeTokenText(encodedName);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `malformed ${FILE_NAME_HEADER} header: ${(err as Error)?.message ?? err}`,
      { cause: err },
    );
  }
  const mimeType = file.headers.get('Content-Type');
  return {
    bytes: file.bytes,
    name,
    ...(mimeType !== null ? { mimeType } : {}),
  };
}
