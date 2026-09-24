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
 * is the decoded bytes; the metadata rides as headers — `Content-Type`
 * for the declared mime type, `X-EmbedPDF-File-Name` for the file name.
 * Used by the document-level `attachments.download()`; the annotation-level
 * `annotations.readResource(ref, 'file')` reads the same response's bytes.
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
