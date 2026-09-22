import type { PluginContext } from '@embedpdf/core';

import type { SignatureAction, SignatureState } from '../model';

/** The plugin context every area receives — the kernel's, typed to this slice. */
export type SignatureContext = PluginContext<SignatureState, SignatureAction>;
