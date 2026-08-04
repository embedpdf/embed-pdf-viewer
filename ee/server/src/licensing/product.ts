export interface CloudPdfLicenseIdentity {
  accountId: string;
  apiUrl: string;
  environment?: string;
  previousPublicKeyHexes?: readonly string[];
  productId: string;
  publicKeyHex: string;
}

// These values are public identifiers, not credentials. Keygen recommends
// compiling the account, product and verification key into the application so
// an operator cannot point an unmodified binary at their own licensing account.
const productionIdentity: CloudPdfLicenseIdentity = {
  accountId: 'f526a26a-fde7-47c9-84f6-2d3dfc18b546',
  apiUrl: 'https://api.keygen.sh',
  productId: '3b5ece8e-a818-4256-98a0-d2887a643389',
  publicKeyHex: '86eb58b320f0dd102e33b54c2159f5baab0515175aab90ef2f3b606f76c0475e',
};

export function resolveCloudPdfLicenseIdentity(
  env: NodeJS.ProcessEnv = process.env,
): CloudPdfLicenseIdentity {
  const isProduction = env['NODE_ENV'] === 'production';
  const hasOverride =
    env['CLOUDPDF_KEYGEN_ACCOUNT_ID'] !== undefined ||
    env['CLOUDPDF_KEYGEN_PRODUCT_ID'] !== undefined ||
    env['CLOUDPDF_KEYGEN_PUBLIC_KEY'] !== undefined ||
    env['CLOUDPDF_KEYGEN_PREVIOUS_PUBLIC_KEYS'] !== undefined ||
    env['CLOUDPDF_KEYGEN_API_URL'] !== undefined ||
    env['CLOUDPDF_KEYGEN_ENVIRONMENT'] !== undefined;

  if (isProduction && hasOverride) {
    throw new Error(
      'CloudPDF Keygen identity overrides are forbidden in production builds',
    );
  }

  if (isProduction || !hasOverride) {
    return productionIdentity;
  }

  const publicKeyHex = env['CLOUDPDF_KEYGEN_PUBLIC_KEY'] ?? productionIdentity.publicKeyHex;
  if (!/^[a-f0-9]{64}$/i.test(publicKeyHex)) {
    throw new Error('CLOUDPDF_KEYGEN_PUBLIC_KEY must be a 32-byte hexadecimal Ed25519 key');
  }
  const previousPublicKeyHexes = parsePreviousPublicKeys(
    env['CLOUDPDF_KEYGEN_PREVIOUS_PUBLIC_KEYS'],
  );

  return {
    accountId: env['CLOUDPDF_KEYGEN_ACCOUNT_ID'] ?? productionIdentity.accountId,
    apiUrl: (env['CLOUDPDF_KEYGEN_API_URL'] ?? productionIdentity.apiUrl).replace(/\/$/, ''),
    ...(env['CLOUDPDF_KEYGEN_ENVIRONMENT']
      ? { environment: env['CLOUDPDF_KEYGEN_ENVIRONMENT'] }
      : {}),
    productId: env['CLOUDPDF_KEYGEN_PRODUCT_ID'] ?? productionIdentity.productId,
    ...(previousPublicKeyHexes.length > 0 ? { previousPublicKeyHexes } : {}),
    publicKeyHex,
  };
}

function parsePreviousPublicKeys(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const keys = [...new Set(value.split(',').map((key) => key.trim()).filter(Boolean))];
  for (const key of keys) {
    if (!/^[a-f0-9]{64}$/i.test(key)) {
      throw new Error(
        'CLOUDPDF_KEYGEN_PREVIOUS_PUBLIC_KEYS must be comma-separated 32-byte hexadecimal Ed25519 keys',
      );
    }
  }
  return keys;
}
