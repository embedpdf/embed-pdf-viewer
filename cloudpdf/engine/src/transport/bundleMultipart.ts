import {
  EngineError,
  EngineErrorCode,
  type BundleKind,
  type BundleLimits,
  type ResourceId,
} from '@embedpdf/engine-core/runtime';

/** The server holds the bundle limits; the client only checks what arrived. */
export const NO_BUNDLE_LIMITS: BundleLimits = {
  bundleBytes: Infinity,
  manifestBytes: Infinity,
  items: Infinity,
  pages: Infinity,
  resources: Infinity,
  resourceBytes: Infinity,
  imagePixels: Infinity,
};

/**
 * An exported bundle as the server sends it: the `manifest` part (the bundle
 * without its bytes, as JSON) and one `resource:<id>` part per resource.
 * The caller checks the bundle.
 */
export async function readBundleParts(
  kind: BundleKind,
  form: FormData,
): Promise<{ manifest: unknown; resources: Record<ResourceId, Uint8Array> }> {
  const manifest = form.get('manifest');
  if (typeof manifest !== 'string') {
    throw new EngineError(EngineErrorCode.WireFormat, `${kind} export has no manifest part`);
  }
  const resources: Record<ResourceId, Uint8Array> = {};
  const parts: Array<[string, FormDataEntryValue]> = [];
  form.forEach((value, name) => parts.push([name, value]));
  for (const [name, value] of parts) {
    if (!name.startsWith('resource:')) continue;
    if (typeof value === 'string') {
      throw new EngineError(EngineErrorCode.WireFormat, `${kind} export part ${name} is text`);
    }
    resources[name.slice('resource:'.length) as ResourceId] = new Uint8Array(
      await value.arrayBuffer(),
    );
  }
  return { manifest: JSON.parse(manifest), resources };
}

/**
 * A bundle import as one multipart body: the `manifest` part (the bundle
 * without its bytes, and the options), then each resource once, as a
 * `resource:<id>` part.
 */
export function bundleImportForm(
  manifest: unknown,
  resources: Readonly<Record<string, Uint8Array>>,
): FormData {
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  for (const [id, bytes] of Object.entries(resources)) {
    form.append(`resource:${id}`, new Blob([bytes as BlobPart]), id);
  }
  return form;
}
