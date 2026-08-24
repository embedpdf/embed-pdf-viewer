import type { WireResourceMap } from '@embedpdf/engine-core/runtime';

/**
 * Multipart envelope for mutations that carry binaries: part `body` holds
 * the exact JSON the plain request would have been, plus one
 * `resource:{key}` file part per binary payload. Mirrors the appearance
 * response protocol (`manifest` part + named image parts) in reverse.
 * Shared by the annotation mutations (stamp images, attachment files) and
 * the document-level `attachments.create` — one envelope, one parser on
 * the server side.
 */
export function buildMutationForm(body: unknown, resources: WireResourceMap): FormData {
  const form = new FormData();
  form.append('body', JSON.stringify(body));
  for (const [key, resource] of Object.entries(resources)) {
    form.append(
      `resource:${key}`,
      new Blob([resource.bytes], { type: resource.mimeType ?? 'application/octet-stream' }),
      resource.name ?? key,
    );
  }
  return form;
}

export function hasResources(resources: WireResourceMap): boolean {
  return Object.keys(resources).length > 0;
}
