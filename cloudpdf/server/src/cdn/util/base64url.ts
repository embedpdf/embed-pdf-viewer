/**
 * Base64 helpers used across CDN signers. Three flavours:
 *
 *   - standard base64 (no transformation)
 *   - RFC 4648 base64url (`+`→`-`, `/`→`_`, no padding)
 *   - AWS CloudFront base64 (`+`→`-`, `/`→`~`, `=`→`_`)
 *
 * AWS chose their own scheme because `+ / =` are illegal in cookies
 * and signed-URL query params; their variant is documented in the
 * CloudFront developer guide.
 */

export function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function cloudfrontBase64(bytes: Buffer | string): string {
  const b64 =
    typeof bytes === 'string'
      ? Buffer.from(bytes, 'utf8').toString('base64')
      : bytes.toString('base64');
  return b64.replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');
}
