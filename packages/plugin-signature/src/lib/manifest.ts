import { PluginManifest } from '@embedpdf/core';
import { SignatureMode, SignaturePluginConfig } from './types';

export const SIGNATURE_PLUGIN_ID = 'signature';

export const manifest: PluginManifest<SignaturePluginConfig> = {
  id: SIGNATURE_PLUGIN_ID,
  name: 'Signature Plugin',
  version: '1.0.0',
  provides: ['signature'],
  requires: ['annotation'],
  optional: [],
  defaultConfig: {
    mode: SignatureMode.SignatureOnly,
  },
};
