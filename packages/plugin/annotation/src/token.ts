/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { AnnotationCapability } from './contract';

export const AnnotationToken = createCapabilityToken<AnnotationCapability>('annotation', {
  hint: `add annotationPlugin() from '@embedpdf/plugin-annotation' to your plugins list`,
});
