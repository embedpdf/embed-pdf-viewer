/** Session authority and the mode/signer resolution. */
import { PluginError } from '@embedpdf/core';
import type { SignerPort } from '@embedpdf/core-signature';

import type { SignatureConfig, SignatureMode } from '../contract';
import type { SignatureContext } from './context';

export function createAuthority(ctx: SignatureContext, config: SignatureConfig) {
  const allows = (capability: 'doc.sign' | 'doc.sign.certify' | 'doc.forms.fill'): boolean =>
    ctx.doc.security.allows(capability);
  const mode = (): SignatureMode => config.mode ?? (config.signer ? 'sign' : 'visual');
  const resolveSigner = async (
    override?: SignerPort | (() => Promise<SignerPort>),
  ): Promise<SignerPort> => {
    const signer = override ?? config.signer;
    if (!signer) {
      throw new PluginError(
        'invalid-input',
        'signature',
        'no signer: configure `signer` or pass one with the call (mode "sign" needs one)',
      );
    }
    return typeof signer === 'function' ? signer() : signer;
  };
  return {
    allows,
    mode,
    resolveSigner,
    canSign: () => allows('doc.sign') && config.signer != null,
    canFill: () => allows('doc.forms.fill') && ctx.doc.forms.setSignatureAppearance != null,
    canCertify: () => config.allowCertify === true && allows('doc.sign.certify'),
  };
}
export type SignatureAuthority = ReturnType<typeof createAuthority>;
