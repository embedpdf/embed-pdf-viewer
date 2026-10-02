import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

import { PluginError } from './errors';
import type { Permission } from './types';

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
