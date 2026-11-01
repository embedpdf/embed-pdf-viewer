import { InvalidScope } from '@embedpdf/engine-core/runtime';
import { describe, expect, test } from 'vitest';
import { PermissionRegistry } from '../src/auth/permission-registry';

function registry(): PermissionRegistry {
  const permissions = new PermissionRegistry();
  permissions.register('protected-display', {
    view: { level: 'document', label: 'See pages with screenshot protection' },
    settings: { level: 'tenant', label: 'Change screenshot protection settings' },
  });
  return permissions;
}

describe('PermissionRegistry', () => {
  test('a plugin declares its permissions without its prefix', () => {
    expect(
      registry()
        .list()
        .map((p) => p.name),
    ).toEqual(['protected-display.view', 'protected-display.settings']);
  });

  test('document permissions are the ones a document session can hold', () => {
    expect([...registry().documentPermissions()]).toEqual(['protected-display.view']);
  });

  test('a scope may grant installed plugin permissions, at their level', () => {
    const permissions = registry();
    expect(() =>
      permissions.assertGrantable(['doc.open', 'doc.text.select', 'protected-display.view']),
    ).not.toThrow();
    expect(() =>
      permissions.assertGrantable(['protected-display.settings'], ['document', 'tenant']),
    ).not.toThrow();
  });

  test('a plugin permission no installed plugin declares is refused where people grant it', () => {
    expect(() => registry().assertGrantable(['ai-chat.ask'])).toThrow(InvalidScope);
    expect(() => registry().assertGrantable(['protected-display.veiw'])).toThrow(
      /no installed plugin declares/,
    );
  });

  test('a tenant permission is refused in a document scope', () => {
    expect(() => registry().assertGrantable(['protected-display.settings'])).toThrow(
      /tenant permission can't be granted here/,
    );
  });

  test("core words are left to the core's own validation", () => {
    expect(() =>
      registry().assertGrantable(['doc.render', 'annotations:create:self', '*']),
    ).not.toThrow();
  });

  test('a plugin can only declare words in its own namespace', () => {
    const permissions = new PermissionRegistry();
    expect(() =>
      permissions.register('doc', { render2: { level: 'document', label: 'x' } }),
    ).toThrow(InvalidScope);
    expect(() =>
      permissions.register('Protected', { view: { level: 'document', label: 'x' } }),
    ).toThrow(/plugin permission shape/);
    permissions.register('snapshot', { create: { level: 'document', label: 'x' } });
    expect(() =>
      permissions.register('snapshot', { create: { level: 'document', label: 'x' } }),
    ).toThrow(/declared twice/);
  });
});
