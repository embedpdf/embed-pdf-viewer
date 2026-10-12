import type { ResourceId } from '@embedpdf/engine-core/runtime';

/**
 * A bundle's resources as the caller gets them. The worker transferred each
 * buffer, so the bundle owns it now: no copy.
 */
export function ownedResources(
  resources: Readonly<Record<ResourceId, ArrayBuffer>>,
): Record<ResourceId, Uint8Array> {
  return Object.fromEntries(
    Object.entries(resources).map(([id, bytes]) => [id, new Uint8Array(bytes)]),
  );
}

/**
 * A private copy of each resource of a bundle going to the worker, to ride
 * the transfer list once however many rows name it. The caller's bytes
 * stay intact.
 */
export function transferableResources(
  resources: Readonly<Record<ResourceId, Uint8Array>>,
): Record<ResourceId, ArrayBuffer> {
  return Object.fromEntries(
    Object.entries(resources).map(([id, bytes]) => [
      id,
      new Uint8Array(bytes).buffer as ArrayBuffer,
    ]),
  );
}
