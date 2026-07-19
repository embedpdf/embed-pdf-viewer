import type { FileAttachmentDraft, FileAttachmentWireDraft, WireAttachmentFile } from './draft';
import type { AttachmentFileSource } from '../../../dto/Attachment';
import { EngineError } from '../../../errors/EngineError';
import { EngineErrorCode } from '../../../errors/EngineErrorCode';
import {
  resolveBinarySource,
  type WireResource,
  type WireResourceMap,
} from '../../../resource/BinarySource';

/**
 * Resolve an attachment `file` into its wire halves: metadata into the
 * JSON body, bytes into the resource map. Unlike stamps there is NO
 * format allowlist — attaching arbitrary files is the point — so the
 * declared mime type wins (attachment formats cannot be reliably sniffed;
 * the writer falls back to `application/octet-stream` when absent).
 *
 * Shared by the file-attachment annotation draft (below) and the
 * document-level `attachments.create` mutation — one vocabulary, one
 * normalizer for both homes a file can enter a PDF through.
 */
export async function normalizeAttachmentFileSource(
  file: AttachmentFileSource,
  key: string,
): Promise<{ wireFile: WireAttachmentFile; resource: WireResource }> {
  const resolved = await resolveBinarySource(file.data);
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

export async function normalizeFileAttachmentDraft(
  draft: FileAttachmentDraft,
  allocateKey: () => string,
): Promise<{ wire: FileAttachmentWireDraft; resources: WireResourceMap }> {
  const { file, ...rest } = draft;
  const key = allocateKey();
  const { wireFile, resource } = await normalizeAttachmentFileSource(file, key);
  return { wire: { ...rest, file: wireFile }, resources: { [key]: resource } };
}
