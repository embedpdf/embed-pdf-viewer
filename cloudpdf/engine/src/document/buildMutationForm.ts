import type {
  WireAnnotationResources,
  WireResource,
  WireResourceMap,
} from '@embedpdf/engine-core/runtime';

/**
 * The multipart envelope of a write that carries files, in the shape every
 * multipart message has: the `body` part holds the JSON the plain request
 * would have been, which names each file by role
 * (`resources: { <role>: <key> }`), and each file is the part
 * `resource:<key>`.
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
 * The envelope of a write with at most one file per role (an annotation's
 * drawing or attached file, a page insert's source PDF, a signature's
 * mark): each file's key is its role's name, and the body names it so,
 * `resources: { <role>: '<role>' }`.
 */
export function buildRoleMutationForm(
  body: object,
  files: Readonly<Record<string, WireResource | undefined>>,
): FormData {
  const parts: WireResourceMap = {};
  const resources: Record<string, string> = {};
  for (const [role, file] of Object.entries(files)) {
    if (!file) continue;
    parts[role] = file;
    resources[role] = role;
  }
  return buildMutationForm(
    Object.keys(resources).length > 0 ? { ...body, resources } : body,
    parts,
  );
}

/** An annotation write's envelope: its drawing and attached file, by role. */
export function buildAnnotationMutationForm(
  body: object,
  resources: WireAnnotationResources,
): FormData {
  return buildRoleMutationForm(body, {
    appearance: resources.appearance && { bytes: resources.appearance },
    file: resources.file && { bytes: resources.file },
  });
}
