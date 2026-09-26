import { definePlugin } from '@embedpdf/core';

import { MetadataToken, type MetadataCapability } from './contract';
import { createMetadataController } from './controller';

/** Document-scoped, reactive Info-dict metadata. Takes no configuration. */
export const metadataPlugin = () =>
  definePlugin<void, MetadataCapability>({
    id: 'metadata',
    token: MetadataToken,
    scope: 'document',
    create: createMetadataController,
  });
