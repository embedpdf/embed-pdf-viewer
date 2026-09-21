import type { ControllerContext } from '@embedpdf/core';

import type { FormAction, FormState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type FormContext = ControllerContext<FormState, FormAction>;
