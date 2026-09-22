/** Marks → the one-page appearance bytes the engine draws into a field. */
import { PluginError } from '@embedpdf/core';
import { resolveBinarySource, type BinarySource } from '@embedpdf/engine-core/runtime';

import type { Mark } from '../contract';
import type { SignatureSiblings } from './siblings';

export function createMarks({ stamp }: Pick<SignatureSiblings, 'stamp'>) {
  const bytesOf = async (source: BinarySource): Promise<Uint8Array> =>
    new Uint8Array((await resolveBinarySource(source)).bytes);
  const markBytes = async (mark: Mark): Promise<Uint8Array> => {
    if ('assetId' in mark) {
      const bytes = stamp()?.readAssetBytes(mark.assetId);
      if (!bytes) throw new PluginError('not-found', 'signature', `unknown mark '${mark.assetId}'`);
      return bytes;
    }
    return bytesOf(mark.source);
  };
  return { bytesOf, markBytes };
}
export type SignatureMarks = ReturnType<typeof createMarks>;
