import type { PluginContext } from '@embedpdf/core';

import type { SignatureSettings } from '../contract';
import type { SignatureState } from '../model';

/** The plugin context every area receives, typed to the signature state and settings. */
export type SignatureContext = PluginContext<SignatureState, SignatureSettings>;
