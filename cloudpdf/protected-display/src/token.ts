import { createCapabilityToken } from '@embedpdf/core';

import type { ProtectedDisplayCapability } from './contract';

export const ProtectedDisplayToken = createCapabilityToken<ProtectedDisplayCapability>(
  'protected-display',
  { hint: "add protectedDisplayPlugin() from '@cloudpdf/protected-display' to your plugins list" },
);
