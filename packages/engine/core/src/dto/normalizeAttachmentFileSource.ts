import type { AttachmentFileSource, WireAttachmentFile } from './Attachment';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { resolveBinarySource, type WireResource } from '../resource/BinarySource';

/**
 * Resolve an attachment `file` into its wire halves: metadata into the
 * JSON body, bytes into the resource map. Unlike stamps there is no
 * format allowlist — attaching arbitrary files is the point — so the
 * declared mime type wins (attachment formats cannot be reliably sniffed;
 * the writer falls back to `application/octet-stream` when absent).
 * Used by the document-level `attachments.create`.
 */
export async function normalizeAttachmentFileSource(
  file: AttachmentFileSource,
  key: string,
): Promise<{ wireFile: WireAttachmentFile; resource: WireResource }> {
  const resolved = await resolveBinarySource(
    file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : file.data,
  );
  const name = file.name ?? resolved.name;
  if (!name) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'attachment file requires a name — pass { data, name } or a File whose name is set',
    );
  }
  const mimeType = file.mimeType ?? resolved.mimeType;
  return {
    wireFile: {
      resource: key,
      name,
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(file.description !== undefined ? { description: file.description } : {}),
    },
    resource: { bytes: resolved.bytes, ...(mimeType !== undefined ? { mimeType } : {}), name },
  };
}
