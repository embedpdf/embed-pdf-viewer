import type { ControllerContext } from '@embedpdf/core';

import type { RedactionAction, RedactionState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type RedactionContext = ControllerContext<RedactionState, RedactionAction>;
