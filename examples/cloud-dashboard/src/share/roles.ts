import { caps, collab } from '@embedpdf/engine-core';

import type { ShareIdentity } from '../api/types';

/**
 * Roles are the product-facing name for a set of scopes.
 *
 * The scope vocabulary itself belongs to the engine (`auth/scope`), and every
 * switch stays reachable in the dialog's advanced section. These presets exist
 * because "Reviewer" is what a person picks, while `annotations:update:self` is
 * what the token carries.
 *
 * Scopes are BUILT, never typed as strings: `collab.annotations.update.group(id)`
 * fails the build if the grammar changes, whereas a literal
 * `'annotations:update:group'` is silently malformed (it needs `=<id>`).
 *
 * A role is PROVENANCE, not a type: it names how a share was made. Editing any
 * scope makes the share `custom`, because a label claiming "Reviewer" over
 * scopes that aren't Reviewer's is the lie this whole dialog exists to avoid.
 */

export interface Role {
  id: string;
  label: string;
  description: string;
  /**
   * The concrete scopes for an identity. Collab roles are parametric — a
   * "group editor" is only meaningful once you know WHICH group — so this is
   * a function of the identity, not a constant.
   */
  scopes: (identity: ShareIdentity) => string[];
  /** Identity fields without which this role can't be materialized. */
  requires?: Array<keyof ShareIdentity>;
}

/**
 * On every role: establish a session, get pixels, and read the form's field
 * structure.
 *
 * `doc.forms.read` belongs here rather than with the editing roles because a
 * filled field's value is ALREADY in the rendered page — withholding the
 * capability hides nothing, it just leaves the viewer's form layer unable to
 * load definitions (the `/form` route 403s and fields stop being interactive).
 * Reading is unconditional in PDF terms too: it has no permission bit.
 */
const READ = [caps.doc.open(), caps.doc.render(), caps.doc.forms.read()];
const TEXT = [caps.doc.text.select(), caps.doc.text.copy()];

export const ROLES: Role[] = [
  {
    id: 'viewer',
    label: 'Read-only',
    description: 'Open and read. No text selection, no comments, no download.',
    scopes: () => [...READ],
  },
  {
    id: 'reader',
    label: 'Reader',
    description: 'Read, plus select and copy text.',
    scopes: () => [...READ, ...TEXT],
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Comment on the document, but only edit their OWN comments.',
    requires: ['user_id'],
    scopes: () => [
      ...READ,
      ...TEXT,
      caps.doc.annotate.read(),
      collab.annotations.create.self(),
      collab.annotations.update.self(),
      collab.annotations.delete.self(),
    ],
  },
  {
    id: 'group-editor',
    label: 'Group editor',
    description: 'Comment, and edit anything from their group.',
    requires: ['group_id'],
    scopes: (identity) => {
      const group = identity.group_id ?? '';
      return [
        ...READ,
        ...TEXT,
        caps.doc.annotate.read(),
        collab.annotations.create.group(group),
        collab.annotations.update.group(group),
        collab.annotations.delete.group(group),
      ];
    },
  },
  {
    id: 'editor',
    label: 'Editor',
    description: 'Full annotation rights over every comment in their layer, plus download.',
    scopes: () => [
      ...READ,
      ...TEXT,
      caps.doc.annotate.read(),
      caps.doc.annotate.modify(),
      caps.doc.forms.fill(),
      caps.doc.metadata.modify(),
      caps.doc.download(),
    ],
  },
  {
    id: 'owner',
    label: 'Owner',
    description: 'Everything, including page edits and redaction.',
    scopes: () => [
      ...READ,
      ...TEXT,
      caps.doc.annotate.read(),
      caps.doc.annotate.modify(),
      caps.doc.forms.fill(),
      caps.doc.forms.modify(),
      caps.doc.metadata.modify(),
      caps.doc.pages.assemble(),
      caps.doc.redact(),
      caps.doc.download(),
      caps.doc.download.flattened(),
    ],
  },
];

export const CUSTOM_ROLE_ID = 'custom';
export const DEFAULT_ROLE_ID = 'reviewer';

export function roleById(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id);
}

/** Human label for a stored share's role id (including `custom`). */
export function roleLabel(id: string): string {
  return roleById(id)?.label ?? 'Custom';
}

/**
 * The scopes a role produces for an identity, or a reason it can't be
 * materialized — a group role without a group id would mint
 * `annotations:update:group=`, which is a malformed grant, not a narrow one.
 */
export function materializeScopes(
  role: Role,
  identity: ShareIdentity,
): { scopes: string[]; missing?: keyof ShareIdentity } {
  const missing = role.requires?.find((field) => !identity[field]);
  if (missing) return { scopes: [], missing };
  return { scopes: role.scopes(identity) };
}
