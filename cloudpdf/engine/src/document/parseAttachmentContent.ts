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
/** Header carrying the file's declared type; absent when it has none. */
const FILE_TYPE_HEADER = 'X-EmbedPDF-File-Type';

/**
 * Project an attachment-file response into `AttachmentContent`. The body
 * is the decoded bytes; the metadata rides as headers — `X-EmbedPDF-File-Type`
 * for the declared type (`Content-Type` is only what HTTP needs), and
 * `X-EmbedPDF-File-Name` for the file name.
 * Used by the document-level `attachments.download()`; the annotation-level
 * `annotations.downloadResource(ref, 'file')` reads the same response's bytes.
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
  return { bytes: file.bytes, name, mimeType: file.headers.get(FILE_TYPE_HEADER) };
}
