import { z, type ZodTypeAny } from 'zod';
import type { SecretRef } from './SecretsProvider';
import type { SecretsProviderRegistry } from './createSecretsProvider';

export type SecretResolveRequest =
  | SecretRef
  | { readonly ref: SecretRef; readonly as?: 'buffer' }
  | { readonly ref: SecretRef; readonly as: 'string' }
  | { readonly ref: SecretRef; readonly as: 'json'; readonly schema?: ZodTypeAny };

export type ResolvedSecret<TRequest> = TRequest extends SecretRef
  ? Buffer
  : TRequest extends { readonly as: 'string' }
    ? string
    : TRequest extends { readonly as: 'json'; readonly schema: infer TSchema }
      ? TSchema extends ZodTypeAny
        ? z.infer<TSchema>
        : unknown
      : Buffer;

export type ResolvedSecretMap<TRequests extends Record<string, SecretResolveRequest>> = {
  readonly [K in keyof TRequests]: ResolvedSecret<TRequests[K]>;
};

export interface SecretResolver {
  resolve<TRequests extends Record<string, SecretResolveRequest>>(
    requests: TRequests,
  ): Promise<ResolvedSecretMap<TRequests>>;
}

export function createSecretResolver(providers: SecretsProviderRegistry): SecretResolver {
  return {
    resolve: (requests) => resolveSecretRequests(providers, requests),
  };
}

export async function resolveSecretRequests<TRequests extends Record<string, SecretResolveRequest>>(
  providers: SecretsProviderRegistry,
  requests: TRequests,
): Promise<ResolvedSecretMap<TRequests>> {
  const entries = await Promise.all(
    Object.entries(requests).map(async ([key, request]) => [
      key,
      await resolveSecretRequest(providers, request),
    ]),
  );
  return Object.fromEntries(entries) as ResolvedSecretMap<TRequests>;
}

export async function resolveSecretRequest(
  providers: SecretsProviderRegistry,
  request: SecretResolveRequest,
): Promise<Buffer | string | unknown> {
  const normalized = normalizeRequest(request);
  const provider = providers.get(normalized.ref.provider);
  if (!provider) {
    throw new Error(`unknown secrets provider: ${normalized.ref.provider}`);
  }
  const bytes = (await provider.get(normalized.ref)).bytes;
  switch (normalized.as) {
    case 'buffer':
      return bytes;
    case 'string':
      return bytes.toString('utf8');
    case 'json': {
      const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
      return normalized.schema ? normalized.schema.parse(parsed) : parsed;
    }
  }
}

function normalizeRequest(request: SecretResolveRequest): {
  ref: SecretRef;
  as: 'buffer' | 'string' | 'json';
  schema?: ZodTypeAny;
} {
  if ('ref' in request) {
    return {
      ref: request.ref,
      as: request.as ?? 'buffer',
      ...('schema' in request && request.schema ? { schema: request.schema } : {}),
    };
  }
  return { ref: request, as: 'buffer' };
}
