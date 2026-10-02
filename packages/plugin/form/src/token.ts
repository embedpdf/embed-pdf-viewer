/** The package token — created once here; `contract.ts` re-exports it and
 *  `host-contract.ts` widens it to the host capability. */
import { createCapabilityToken } from '@embedpdf/core';

import type { FormCapability } from './contract';

export const FormToken = createCapabilityToken<FormCapability>('form', {
  hint: `add formPlugin() from '@embedpdf/plugin-form' to your plugins list`,
  // Without a document, an adapter's stand-in rejects these with `not-ready`, as the
  // capability would; the type asks for every member that returns a promise.
  promises: {
    setValue: true,
    setValues: true,
    importValues: true,
    reset: true,
    activateWidget: true,
    export: true,
    import: true,
    refresh: true,
    create: true,
    update: true,
    delete: true,
    removeWidget: true,
    repair: true,
  },
});
