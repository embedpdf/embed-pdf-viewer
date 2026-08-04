export interface CloudPdfLicenseIdentity {
  accountId: string;
  apiUrl: string;
  environment?: string;
  previousPublicKeyHexes?: readonly string[];
  productId: string;
  publicKeyHex: string;
}

// These values are public identifiers, not credentials. They are deliberately
// compiled into the production artifact: operator-controlled configuration is
// not a trust boundary for license verification.
const productionIdentity: Readonly<CloudPdfLicenseIdentity> = Object.freeze({
  accountId: 'f526a26a-fde7-47c9-84f6-2d3dfc18b546',
  apiUrl: 'https://api.keygen.sh',
  productId: '3b5ece8e-a818-4256-98a0-d2887a643389',
  publicKeyHex: '86eb58b320f0dd102e33b54c2159f5baab0515175aab90ef2f3b606f76c0475e',
});

export function resolveCloudPdfLicenseIdentity(
  env: NodeJS.ProcessEnv = process.env,
): CloudPdfLicenseIdentity {
  const forbidden = [
    'CLOUDPDF_KEYGEN_ACCOUNT_ID',
    'CLOUDPDF_KEYGEN_PRODUCT_ID',
    'CLOUDPDF_KEYGEN_PUBLIC_KEY',
    'CLOUDPDF_KEYGEN_PREVIOUS_PUBLIC_KEYS',
    'CLOUDPDF_KEYGEN_API_URL',
    'CLOUDPDF_KEYGEN_ENVIRONMENT',
  ].filter((name) => env[name] !== undefined);
  if (forbidden.length > 0) {
    throw new Error(
      `CloudPDF Keygen identity is compiled into the application; remove ${forbidden.join(', ')}`,
    );
  }
  return { ...productionIdentity };
}
