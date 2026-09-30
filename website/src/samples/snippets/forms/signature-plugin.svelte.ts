import { formPlugin } from '@embedpdf/svelte/form';
import { indexedDbKeyStore, personalSigner, signaturePlugin } from '@embedpdf/svelte/signature';
import { stampPlugin } from '@embedpdf/svelte/stamp';
import { rootCertificate } from './certificates';

export const plugins = [
  /* … */
  formPlugin(),
  stampPlugin(),
  signaturePlugin({
    key: () => personalSigner({ subject: 'Ada Lovelace', store: indexedDbKeyStore('my-app-keys') }),
    trust: { anchors: async () => [rootCertificate] }, // the certificates you trust
  }),
];
