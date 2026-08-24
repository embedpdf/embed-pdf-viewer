/**
 * Family-local config schema for the CDN adapter family.
 *
 * Variants (six total):
 *   - none        : built-in, no CDN in front of origin
 *   - bunny       : BunnyCDN (HMAC-SHA256 zone token) — adapter ships in commit G
 *   - cloud-cdn   : Google Cloud CDN (HMAC-SHA1 prefix policy) — adapter ships in G
 *   - cloudfront  : AWS CloudFront (RSA-SHA1 cookies or URLs) — adapter ships in G
 *   - azure-fd    : Azure Front Door (HMAC-SHA256 via rules engine) — adapter ships in G
 *   - custom-hmac : generic escape hatch (covers Cloudflare-via-Worker
 *                   and any DIY edge) — adapter ships in G
 *
 * Schema accepts all six today; `createCdnSigner` constructs only
 * `none` until commit G ships the remaining adapter classes. Lets
 * deployment templates be written ahead of the implementations.
 *
 * Secret-bearing fields use `SecretRefSchema` so they can be resolved
 * through the shared SecretsResolver at construction time.
 */

import { z } from 'zod';

import { SecretRefSchema } from '../../config/secrets/SecretRef';

export const CdnConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
  }),
  z.object({
    kind: z.literal('bunny'),
    zoneHostname: z.string().min(1),
    zoneToken: z.union([SecretRefSchema, z.string().min(1)]),
    apiKey: z.union([SecretRefSchema, z.string().min(1)]).optional(),
  }),
  z.object({
    kind: z.literal('cloud-cdn'),
    urlPrefix: z.string().url(),
    keyName: z.string().min(1),
    keyValue: z.union([SecretRefSchema, z.string().min(1)]),
    projectId: z.string().min(1).optional(),
    serviceAccountKey: z.union([SecretRefSchema, z.string().min(1)]).optional(),
  }),
  z.object({
    kind: z.literal('cloudfront'),
    distributionDomain: z.string().min(1),
    keyPairId: z.string().min(1),
    privateKeyPem: z.union([SecretRefSchema, z.string().min(1)]),
    mode: z.enum(['cookies', 'urls']).default('cookies'),
    distributionId: z.string().min(1).optional(),
    awsRegion: z.string().min(1).optional(),
    cookieDomain: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('azure-fd'),
    endpoint: z.string().url(),
    secret: z.union([SecretRefSchema, z.string().min(1)]),
    profileName: z.string().min(1).optional(),
    subscriptionId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('custom-hmac'),
    cdnOrigin: z.string().url(),
    secret: z.union([SecretRefSchema, z.string().min(1)]),
    transport: z.enum(['header', 'query']).default('header'),
    purgeWebhookUrl: z.string().url().optional(),
  }),
]);

export type CdnConfig = z.infer<typeof CdnConfigSchema>;
