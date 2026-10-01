/** The mode and the key, read from the settings where they're used, so a change applies at once. */
import { PluginError } from '@embedpdf/core';
import type { SignerPort } from '@embedpdf/core-signature';

import type { SignatureKey, SignatureMode } from '../contract';
import type { SignatureContext } from './context';

export function createAuthority(ctx: SignatureContext) {
  const settings = ctx.settings();
  const mode = (): SignatureMode => {
    const { mode: chosen, key } = settings.get();
    return chosen ?? (key ? 'sign' : 'visual');
  };
  const resolveKey = async (override?: SignatureKey): Promise<SignerPort> => {
    const key = override ?? settings.get().key;
    if (!key) {
      throw new PluginError(
        'invalid-input',
        'signature',
        'no key: set the `key` setting or pass one with the call',
      );
    }
    return typeof key === 'function' ? key() : key;
  };
  return {
    mode,
    resolveKey,
    canSign: () => ctx.allows('doc.sign'),
    canFill: () => ctx.allows('doc.forms.fill'),
    canCertify: () => settings.get().allowCertify && ctx.allows('doc.sign.certify'),
    canReadRevision: () => ctx.allows('doc.download'),
  };
}
export type SignatureAuthority = ReturnType<typeof createAuthority>;
