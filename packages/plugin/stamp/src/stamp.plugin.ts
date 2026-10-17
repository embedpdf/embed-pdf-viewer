import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { STAMP_DEFAULTS, StampToken, type StampConfig } from './contract';
import { createStampController } from './controller';
import { initialStampState } from './model';

/**
 * Stamp libraries and assets. Workspace-scoped: libraries outlive any one
 * document; placement targets a document through its annotation plugin.
 * `config` is the settings the app registers, over {@link STAMP_DEFAULTS}.
 */
export const stampPlugin = (config?: StampConfig) =>
  definePlugin({
    id: 'stamp',
    token: StampToken,
    scope: 'workspace',
    optional: [AnnotationToken, ActionsToken],
    state: initialStampState,
    // An engine is one value: a change replaces it, never merges into it.
    settings: { defaults: STAMP_DEFAULTS, registered: config, whole: ['assetEngine'] },
    create: createStampController,
    // Inside a document's scope, a placing call that leaves out the document is for that one.
    inScope: (stamp, documentId) => {
      const scoped = <Options extends { documentId?: string }>(options?: Options) => ({
        ...options,
        documentId: options?.documentId ?? documentId,
      });
      return {
        ...stamp,
        createAssetFromAnnotations: (page, refs, input, options) =>
          stamp.createAssetFromAnnotations(page, refs, input, scoped(options)),
        armAsset: (assetId, options) => stamp.armAsset(assetId, scoped(options)),
        disarm: (target = documentId) => stamp.disarm(target),
        getArmedAsset: (target = documentId) => stamp.getArmedAsset(target),
        placeAsset: (assetId, placement, options) =>
          stamp.placeAsset(assetId, placement, scoped(options)),
        placeAssetOnPages: (assetId, pages, placement, options) =>
          stamp.placeAssetOnPages(assetId, pages, placement, scoped(options)),
        canPlace: (target = documentId) => stamp.canPlace(target),
        canCreateFromAnnotations: (target = documentId) => stamp.canCreateFromAnnotations(target),
      };
    },
  });
