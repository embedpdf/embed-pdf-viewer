import type { FormFieldValue } from './value';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { ChangeOp } from '../mutation/Change';

export type FormFieldDisplay = 'visible' | 'hidden' | 'noPrint' | 'noView';

/** Ordered, committed outputs of one client-side form script run. */
export type FormEffect =
  | { kind: 'setValue'; ref: FormFieldRef; value: FormFieldValue }
  | { kind: 'setDisplay'; ref: FormFieldRef; display: FormFieldDisplay }
  | { kind: 'setAppearanceText'; ref: FormFieldRef; text: string }
  | { kind: 'reset'; refs: FormFieldRef[] };

/**
 * A script run's effects as the ops of one change, in their order: what a
 * form commit sends with `doc.apply`, all or nothing.
 */
export function formEffectOps(effects: readonly FormEffect[]): ChangeOp[] {
  return effects.map((effect): ChangeOp => {
    switch (effect.kind) {
      case 'setValue':
        return { type: 'forms.setValue', field: effect.ref, value: effect.value };
      case 'setDisplay':
        return { type: 'forms.setDisplay', field: effect.ref, display: effect.display };
      case 'setAppearanceText':
        return { type: 'forms.setAppearanceText', field: effect.ref, text: effect.text };
      case 'reset':
        return { type: 'forms.reset', fields: effect.refs };
    }
  });
}
