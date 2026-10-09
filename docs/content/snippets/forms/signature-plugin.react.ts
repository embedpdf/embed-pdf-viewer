import { formPlugin } from '@embedpdf/react/form';
import { indexedDbKeyStore, personalSigner, signaturePlugin } from '@embedpdf/react/signature';
import { stampPlugin } from '@embedpdf/react/stamp';
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
