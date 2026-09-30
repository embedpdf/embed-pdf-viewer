import { formPlugin } from '@embedpdf/vue/form';
import { indexedDbKeyStore, personalSigner, signaturePlugin } from '@embedpdf/vue/signature';
import { stampPlugin } from '@embedpdf/vue/stamp';
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
