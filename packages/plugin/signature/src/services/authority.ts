/**
 * The mode and the key, read from the settings where they're used, so a change
 * applies at once; and who may sign or fill in which field, by the field's
 * group (`ctx.allowsField`), as the engine checks it.
 */
import { PluginError } from '@embedpdf/core';
import type { SignerPort } from '@embedpdf/core-signature';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import type { SignatureKey, SignatureMode } from '../contract';
import type { SignatureContext } from './context';
import type { SignatureSiblings } from './siblings';

export function createAuthority(ctx: SignatureContext, { form }: Pick<SignatureSiblings, 'form'>) {
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
  /** Whether the session may `action` this field; `false` for a field the form doesn't have. */
  const allowsField = (action: 'fill' | 'sign', ref: FormFieldRef): boolean => {
    const field = form.get(ref);
    return field !== null && ctx.allowsField(action, field);
  };
  /** Refuse a write to this field the session may not make, before anything starts. */
  const assertAllowedField = (action: 'fill' | 'sign', ref: FormFieldRef, operation: string) => {
    const field = form.get(ref);
    // A field the form doesn't show yet is the engine's to answer (`not-found`).
    if (field) ctx.assertAllowedField(action, field, operation);
  };
  return {
    mode,
    resolveKey,
    assertAllowedField,
    canSign: (field: FormFieldRef) => allowsField('sign', field),
    canFill: (field: FormFieldRef) => allowsField('fill', field),
    canCertify: () => settings.get().allowCertify && ctx.allows('doc.sign.certify'),
    canReadRevision: () => ctx.allows('doc.download'),
  };
}
export type SignatureAuthority = ReturnType<typeof createAuthority>;
