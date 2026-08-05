/**
 * Factory for CdnSigner instances. Matches the unified adapter
 * pattern (see ADAPTERS.md) — switch on `config.kind`, accept a
 * SecretResolver via `opts.resolver` for SecretRef-bearing variants.
 *
 * Secret-bearing fields in CdnConfig are typed `string | SecretRef`.
 * Plain strings pass through verbatim; SecretRefs are resolved through
 * the injected resolver before being passed to the adapter
 * constructor. Adapters never see SecretRefs — only the resolved
 * literal value.
 */

import { isSecretRefShape } from '../config/secrets/redact';
import type { SecretRef } from '../security/secrets/SecretsProvider';
import type { SecretResolver } from '../security/secrets/SecretResolver';

import type { CdnSigner } from './CdnSigner';
import type { CdnConfig } from './config/CdnConfigSchema';
import { AzureFrontDoorCdnSigner } from './adapters/AzureFrontDoorCdnSigner';
import { BunnyCdnSigner } from './adapters/BunnyCdnSigner';
import { CloudCdnSigner } from './adapters/CloudCdnSigner';
import { CloudFrontCdnSigner } from './adapters/CloudFrontCdnSigner';
import { CustomHmacCdnSigner } from './adapters/CustomHmacCdnSigner';
import { NoneCdnSigner } from './adapters/NoneCdnSigner';

export interface CreateCdnSignerOptions {
  /**
   * Required when the config carries any `SecretRef` field (Bunny
   * zoneToken, CloudFront privateKeyPem, etc.). Plain-string secret
   * fields (literal values, useful for local dev) don't need it.
   *
   * `none` never reads opts at all.
   */
  resolver?: SecretResolver;
}

export async function createCdnSigner(
  config: CdnConfig,
  opts: CreateCdnSignerOptions = {},
): Promise<CdnSigner> {
  switch (config.kind) {
    case 'none':
      return new NoneCdnSigner();

    case 'bunny': {
      const zoneToken = await resolveStringSecret(config.zoneToken, 'bunny.zoneToken', opts);
      const apiKey = config.apiKey
        ? await resolveStringSecret(config.apiKey, 'bunny.apiKey', opts)
        : undefined;
      return new BunnyCdnSigner({
        zoneHostname: config.zoneHostname,
        zoneToken,
        ...(apiKey ? { apiKey } : {}),
      });
    }

    case 'cloud-cdn': {
      const keyValue = await resolveStringSecret(config.keyValue, 'cloud-cdn.keyValue', opts);
      const serviceAccountKey = config.serviceAccountKey
        ? await resolveStringSecret(config.serviceAccountKey, 'cloud-cdn.serviceAccountKey', opts)
        : undefined;
      return new CloudCdnSigner({
        urlPrefix: config.urlPrefix,
        keyName: config.keyName,
        keyValue,
        ...(config.projectId ? { projectId: config.projectId } : {}),
        ...(serviceAccountKey ? { serviceAccountKey } : {}),
      });
    }

    case 'cloudfront': {
      const privateKeyPem = await resolveStringSecret(
        config.privateKeyPem,
        'cloudfront.privateKeyPem',
        opts,
      );
      return new CloudFrontCdnSigner({
        distributionDomain: config.distributionDomain,
        keyPairId: config.keyPairId,
        privateKeyPem,
        mode: config.mode,
        ...(config.distributionId ? { distributionId: config.distributionId } : {}),
        ...(config.awsRegion ? { awsRegion: config.awsRegion } : {}),
        ...(config.cookieDomain ? { cookieDomain: config.cookieDomain } : {}),
      });
    }

    case 'azure-fd': {
      const secret = await resolveStringSecret(config.secret, 'azure-fd.secret', opts);
      return new AzureFrontDoorCdnSigner({
        endpoint: config.endpoint,
        secret,
        ...(config.profileName ? { profileName: config.profileName } : {}),
        ...(config.subscriptionId ? { subscriptionId: config.subscriptionId } : {}),
      });
    }

    case 'custom-hmac': {
      const secret = await resolveStringSecret(config.secret, 'custom-hmac.secret', opts);
      return new CustomHmacCdnSigner({
        cdnOrigin: config.cdnOrigin,
        secret,
        transport: config.transport,
        ...(config.purgeWebhookUrl ? { purgeWebhookUrl: config.purgeWebhookUrl } : {}),
      });
    }
  }
}

/**
 * Resolve a `string | SecretRef` field to a string. Plain strings
 * pass through; SecretRefs go through the resolver. Helpful error
 * when a SecretRef appears but no resolver was supplied.
 */
async function resolveStringSecret(
  value: unknown,
  fieldPath: string,
  opts: CreateCdnSignerOptions,
): Promise<string> {
  if (typeof value === 'string') return value;
  if (isSecretRefShape(value)) {
    if (!opts.resolver) {
      throw new Error(
        `${fieldPath} is a SecretRef but createCdnSigner was called without opts.resolver`,
      );
    }
    const out = await opts.resolver.resolve({
      v: { ref: value as SecretRef, as: 'string' as const },
    });
    return out.v;
  }
  throw new Error(`${fieldPath} must be a string or a SecretRef`);
}
