import { createCapabilityToken } from '@embedpdf/svelte/runtime';
import type { StageCapability } from '@embedpdf/svelte/stage';

// A second view of the same document: its own id and token, its own zoom and layout.
export const OverviewToken = createCapabilityToken<StageCapability>('stage-overview');
