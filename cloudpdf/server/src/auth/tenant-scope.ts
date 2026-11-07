/**
 * A tenant JWT's scope holds two kinds of entries: tenant scopes over the
 * records of the tenant's documents and folders (`docs.read`,
 * `tokens.issue-doc`, …), and document permissions in the doc-token
 * vocabulary (capabilities, collab scopes, `pdf.permissions`), which hold
 * for every document of the tenant as a doc JWT's hold for one. Only the
 * second kind reaches inside a document. `*` is everything. The rules are
 * those of `adminTenantScopes` in `@cloudpdf/contract`.
 */
import { adminTenantScopes } from '@cloudpdf/contract';
import { parseScope } from '@embedpdf/engine-core/runtime';

const tenantScopes: ReadonlySet<string> = new Set(adminTenantScopes);

/** Throws `InvalidScope` for an entry that is neither a tenant scope nor a document permission. */
export function validateTenantScope(scope: ReadonlyArray<string>): void {
  for (const entry of scope) {
    if (entry !== '*' && !tenantScopes.has(entry)) parseScope(entry);
  }
}

/**
 * What a tenant JWT may do inside its tenant's documents, in the doc-token
 * vocabulary: `*` for everything, else exactly the document permissions it
 * names. Tenant scopes grant nothing here, and entries that are neither are
 * ignored.
 */
export function documentScopeOf(scope: ReadonlyArray<string>): string[] {
  if (scope.includes('*')) return ['*'];
  return scope.filter((entry) => !tenantScopes.has(entry) && isDocumentPermission(entry));
}

function isDocumentPermission(entry: string): boolean {
  try {
    return parseScope(entry).kind !== 'wildcard';
  } catch {
    return false;
  }
}
