/** Public selection capability protocol without gesture/reducer/plugin wiring. */
import type { CapabilityToken } from '@embedpdf/core';

import { SelectionToken as SelectionHostToken } from './types';
import type { SelectionCapability } from './types';

export const SelectionToken = SelectionHostToken as unknown as CapabilityToken<SelectionCapability>;
export type {
  SelectionCapability,
  SelectionEndpoint,
  SelectionMenuAnchor,
  SelectionRangeInput,
  SelectionSnapshot,
  TextPosition,
  TextRange,
} from './types';
export type { SelectionSegment } from './geometry';
