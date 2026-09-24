import type { WireAnnotationResources, WireResourceMap } from '@embedpdf/engine-core/runtime';

/**
 * Multipart envelope for mutations that carry binaries: part `body` holds
 * the exact JSON the plain request would have been, plus one
 * `resource:{key}` file part per binary payload. Mirrors the appearance
 * response protocol (`manifest` part + named image parts) in reverse.
 * Shared by the annotation mutations (see {@link buildAnnotationMutationForm})
 * and the document-level `attachments.create` — one envelope, one parser on
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

/**
 * The same envelope for an annotation write: its resources travel as the
 * parts `resource:appearance` and `resource:file`.
 */
export function buildAnnotationMutationForm(
  body: unknown,
  resources: WireAnnotationResources,
): FormData {
  const parts: WireResourceMap = {};
  for (const [role, bytes] of Object.entries(resources)) {
    if (bytes !== undefined) parts[role] = { bytes };
  }
  return buildMutationForm(body, parts);
}
