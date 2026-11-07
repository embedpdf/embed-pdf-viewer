import { open } from 'node:fs/promises';

/**
 * The header of a stored layer artifact (`.layer`), as the runtime writes
 * it (`BuildLayerArtifactHeader` in the fork's `epdf_layer.cpp`):
 *
 *   magic "EPDFLYR1" | version u32 | header size u32 | base size u64 |
 *   append offset u64 | delta size u64 | base sha256 | delta sha256 |
 *   (version 2) births size u64 | last object number u64
 *
 * then the delta, then the births. The delta is an incremental update of
 * the base: a layer opens as the base file followed by its delta, so the
 * two together are the layer's PDF saved incrementally.
 */
export interface LayerArtifactHeader {
  /** Where the delta starts in the artifact. */
  readonly deltaOffset: number;
  readonly deltaSize: number;
  /** The base file the delta updates: its size and sha256 (hex). */
  readonly baseSize: number;
  readonly baseSha256: string;
}

const MAGIC = 'EPDFLYR1';
/** Through the delta sha: what every version has. */
const MIN_HEADER_SIZE = 8 + 4 + 4 + 8 * 3 + 32 * 2;
const KNOWN_VERSIONS = new Set([1, 2]);

/**
 * The header of the artifact at `path`, or `null` when it isn't one of the
 * versions this server reads (the engine still opens those).
 */
export async function readLayerArtifactHeader(
  path: string,
  fileSize: number,
): Promise<LayerArtifactHeader | null> {
  const file = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(fileSize, 256));
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead < MIN_HEADER_SIZE || bytes.toString('latin1', 0, 8) !== MAGIC) return null;
    if (!KNOWN_VERSIONS.has(bytes.readUInt32LE(8))) return null;
    const headerSize = bytes.readUInt32LE(12);
    const deltaSize = Number(bytes.readBigUInt64LE(32));
    if (headerSize < MIN_HEADER_SIZE || headerSize + deltaSize > fileSize) return null;
    return {
      deltaOffset: headerSize,
      deltaSize,
      baseSize: Number(bytes.readBigUInt64LE(16)),
      baseSha256: bytes.toString('hex', 40, 72),
    };
  } finally {
    await file.close();
  }
}
