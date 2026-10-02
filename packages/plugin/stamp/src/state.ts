/**
 * The stamps page's State table as code: what `useStampState()` returns, and
 * the same fields in every other framework. It reads the document in scope,
 * else the active one. The libraries and their stamps are not here:
 * `useStampLibraries()` and `useStampAssets()` read them, so a component that
 * only shows the armed stamp doesn't re-render when a library changes.
 */
import { defineState } from '@embedpdf/core';

import { StampToken } from './contract';

export const stampState = defineState(StampToken, {
  read: (stamp) => ({
    armedAsset: stamp.getArmedAsset(),
  }),
  empty: {
    armedAsset: null,
  },
});
