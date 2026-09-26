import type { PluginContext } from '@embedpdf/core';

import type { SignatureState } from '../model';

/** The plugin context every area receives, typed to the signature state. */
export type SignatureContext = PluginContext<SignatureState>;
