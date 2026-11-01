/**
 * The plugin permissions this server knows: the ones its installed plugins
 * declare. Tokens carry any well-formed plugin permission (`parseScope`
 * accepts `<plugin id>.<action>`); this registry decides which of them take
 * effect here, what `*` grants, and which ones people may grant. The core's
 * own words never come through here: the core knows them already.
 */
import { InvalidScope, parseScope, pluginOfPermission } from '@embedpdf/engine-core/runtime';

/** Where a permission is held: in a document token, or in a tenant token or API key. */
export type PermissionLevel = 'document' | 'tenant';

export interface PermissionDeclaration {
  readonly level: PermissionLevel;
  /** What the grant and API key dialogs say. */
  readonly label: string;
  readonly description?: string;
}

export interface RegisteredPermission extends PermissionDeclaration {
  /** The whole permission: `protected-display.view`. */
  readonly name: string;
  /** The plugin that declares it, and enforces it. */
  readonly plugin: string;
}

export class PermissionRegistry {
  private readonly permissions = new Map<string, RegisteredPermission>();
  private documentLevel: ReadonlySet<string> = new Set();

  /**
   * Add a plugin's permissions, written without its prefix:
   * `register('protected-display', { view: … })` declares `protected-display.view`.
   */
  register(plugin: string, permissions: Readonly<Record<string, PermissionDeclaration>>): void {
    for (const [action, declaration] of Object.entries(permissions)) {
      const name = `${plugin}.${action}`;
      const parsed = parseScope(name); // a core namespace or a bad shape throws here
      if (parsed.kind !== 'plugin' || parsed.plugin !== plugin) {
        throw new InvalidScope(name, `a plugin's permissions start with its id, "${plugin}."`);
      }
      if (this.permissions.has(name)) throw new InvalidScope(name, 'declared twice');
      this.permissions.set(name, { ...declaration, name, plugin });
    }
    this.documentLevel = new Set(
      [...this.permissions.values()].filter((p) => p.level === 'document').map((p) => p.name),
    );
  }

  /** The installed plugin permissions a document session can hold: what takes effect, and what `*` gives. */
  documentPermissions(): ReadonlySet<string> {
    return this.documentLevel;
  }

  /** Every declared permission, for the grant and API key dialogs and the API docs. */
  list(): readonly RegisteredPermission[] {
    return [...this.permissions.values()];
  }

  /**
   * Refuse a scope that names a plugin permission no installed plugin
   * declares at one of `levels`. Where people grant permissions (a token,
   * a grant, an API key), so a typo or a missing plugin is an error there,
   * not a permission that silently does nothing. Core words are left to the
   * core's own validation.
   */
  assertGrantable(
    scope: ReadonlyArray<string>,
    levels: ReadonlyArray<PermissionLevel> = ['document'],
  ): void {
    for (const entry of scope) {
      if (pluginOfPermission(entry) === null) continue;
      const declared = this.permissions.get(entry);
      if (!declared) {
        throw new InvalidScope(entry, 'no installed plugin declares this permission');
      }
      if (!levels.includes(declared.level)) {
        throw new InvalidScope(entry, `a ${declared.level} permission can't be granted here`);
      }
    }
  }
}
