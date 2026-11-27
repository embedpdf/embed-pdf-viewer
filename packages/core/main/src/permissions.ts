import { assignmentOfGroup, type DocumentHandle } from '@embedpdf/engine-core/runtime';

import { PluginError } from './errors';
import type { AssignedField, Permission } from './types';

/**
 * What `ctx.allows` reads: the document session's own predicates, the ones the
 * engine enforces with, so a control gated on the answer never disagrees with
 * what the verb then does.
 */
export function sessionAllows(
  security: DocumentHandle['security'],
  permission: Permission,
): boolean {
  return permission === 'annotations:create'
    ? security.allowsAnnotation('create')
    : security.allows(permission);
}

/** What `ctx.assertAllowed` throws: a refusal that names what was missing. */
export function permissionDenied(
  capability: string,
  permission: Permission,
  operation: string,
): PluginError {
  return new PluginError('permission-denied', capability, `${operation} requires ${permission}`, {
    permission,
  });
}

/**
 * What a plugin throws for a form field the session may not fill in or sign:
 * a refusal that names the permission it would take, as the engine's does
 * (`fields:<action>:group=<group>`, or the broad one for a field in no
 * group). A field anyone fills in takes any permission to fill in (sign)
 * some field, and names the broad one too: it is in no group.
 */
export function fieldPermissionDenied(
  capability: string,
  action: 'fill' | 'sign',
  field: AssignedField,
  operation: string,
): PluginError {
  const assignment = field.assignment ?? assignmentOfGroup(field.groupId);
  const permission =
    assignment.kind === 'group'
      ? `fields:${action}:group=${assignment.groupId}`
      : action === 'fill'
        ? 'doc.forms.fill'
        : 'doc.sign';
  return new PluginError('permission-denied', capability, `${operation} requires ${permission}`, {
    permission,
  });
}
