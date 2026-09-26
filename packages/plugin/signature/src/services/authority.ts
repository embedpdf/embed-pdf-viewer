/** Session authority and the mode/key resolution. */
import { PluginError } from '@embedpdf/core';
import type { SignerPort } from '@embedpdf/core-signature';

import type { SignatureConfig, SignatureMode } from '../contract';
import type { SignatureContext } from './context';

export function createAuthority(ctx: SignatureContext, config: SignatureConfig) {
  const allows = (capability: 'doc.sign' | 'doc.sign.certify' | 'doc.forms.fill'): boolean =>
    ctx.doc.security.allows(capability);
  const mode = (): SignatureMode => config.mode ?? (config.key ? 'sign' : 'visual');
  const resolveKey = async (
    override?: SignerPort | (() => Promise<SignerPort>),
  ): Promise<SignerPort> => {
    const key = override ?? config.key;
    if (!key) {
      throw new PluginError(
        'invalid-input',
        'signature',
        'no key: configure `key` or pass one with the call (mode "sign" needs one)',
      );
    }
    return typeof key === 'function' ? key() : key;
  };
  return {
    allows,
    mode,
    resolveKey,
    canSign: () => allows('doc.sign') && config.key != null,
    canFill: () => allows('doc.forms.fill') && ctx.doc.forms.setSignatureAppearance != null,
    canCertify: () => config.allowCertify === true && allows('doc.sign.certify'),
  };
}
export type SignatureAuthority = ReturnType<typeof createAuthority>;
