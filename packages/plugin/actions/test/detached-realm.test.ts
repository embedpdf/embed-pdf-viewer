import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@embedpdf/core';
import type { ScriptDiagnostic } from '@embedpdf/core-acrojs';

import { createActionsCapability } from '../src/capability';
import type { ActionsAction, ActionsState } from '../src/types';

function harness() {
  const ctx = {
    doc: { forms: { list: async () => ({ fields: [] }) } },
    documentId: 'doc-1',
    dispatch: vi.fn(),
    tryGet: () => null,
    cleanup: () => {},
  } as unknown as PluginContext<ActionsState, ActionsAction>;
  return createActionsCapability(ctx);
}

describe('detached-realm script surfaces', () => {
  it('forwards only alerts from a detached realm; document-targeting effects are suppressed observably', () => {
    const capability = harness();
    const alert = vi.fn();
    const gotoPage = vi.fn();
    const print = vi.fn();
    capability.setUiAdapter({ openUri: vi.fn(), print, alert, gotoPage });
    const diagnostics: ScriptDiagnostic[] = [];
    capability.onScriptDiagnostic((diagnostic) => diagnostics.push(diagnostic));

    capability.surfaceScriptResult({
      uiEffects: [
        { kind: 'alert', message: 'Approved', icon: 3 },
        { kind: 'gotoPage', page: 4 },
        { kind: 'print' },
        { kind: 'submitForm', url: 'https://example.test', fieldNames: null, includeEmpty: false },
      ],
      diagnostics: [],
      origin: 'user',
      phase: 'user',
      realm: 'detached',
    });

    expect(alert).toHaveBeenCalledWith('Approved', { origin: 'user', phase: 'user', icon: 3 });
    expect(gotoPage).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(diagnostics.map(({ code }) => code)).toEqual([
      'ui-effect-suppressed',
      'ui-effect-suppressed',
      'ui-effect-suppressed',
    ]);
    expect(diagnostics.map(({ message }) => message)).toEqual([
      expect.stringContaining('gotoPage'),
      expect.stringContaining('print'),
      expect.stringContaining('submitForm'),
    ]);
  });

  it("a document realm's gotoPage still reaches the adapter (the suppression is realm-keyed)", () => {
    const capability = harness();
    const gotoPage = vi.fn();
    capability.setUiAdapter({ openUri: vi.fn(), print: vi.fn(), gotoPage });
    capability.surfaceScriptResult({
      uiEffects: [{ kind: 'gotoPage', page: 4 }],
      diagnostics: [],
      origin: 'user',
      phase: 'user',
      realm: 'document',
    });
    expect(gotoPage).toHaveBeenCalledWith(4, { origin: 'user', phase: 'user' });
  });

  it('surfaceScriptCommit splits boot and user phases; diagnostics and the error ride the user phase', () => {
    const capability = harness();
    const alert = vi.fn();
    capability.setUiAdapter({ openUri: vi.fn(), print: vi.fn(), alert });
    const diagnostics: ScriptDiagnostic[] = [];
    capability.onScriptDiagnostic((diagnostic) => diagnostics.push(diagnostic));
    const errors: unknown[] = [];
    capability.onScriptError((error) => errors.push(error));

    capability.surfaceScriptCommit(
      {
        uiEffects: [
          { kind: 'alert', message: 'boot nag', icon: 0, phase: 'boot' },
          { kind: 'alert', message: 'user alert', icon: 1, phase: 'user' },
        ],
        diagnostics: [{ code: 'script-error', message: 'one' }],
        error: { kind: 'exception', message: 'boom' },
      },
      { origin: 'user', realm: 'detached' },
    );

    expect(alert.mock.calls).toEqual([
      ['boot nag', { origin: 'user', phase: 'boot', icon: 0 }],
      ['user alert', { origin: 'user', phase: 'user', icon: 1 }],
    ]);
    expect(diagnostics).toEqual([{ code: 'script-error', message: 'one' }]);
    expect(errors).toHaveLength(1);
  });

  it('a boot phase with no effects is not surfaced at all', () => {
    const capability = harness();
    const seen: Array<'boot' | 'user'> = [];
    capability.setUiAdapter({
      openUri: vi.fn(),
      print: vi.fn(),
      alert: (_message, opts) => seen.push(opts.phase),
    });
    capability.surfaceScriptCommit(
      {
        uiEffects: [{ kind: 'alert', message: 'only user', icon: 0, phase: 'user' }],
        diagnostics: [],
      },
      { origin: 'user', realm: 'document' },
    );
    expect(seen).toEqual(['user']);
  });
});
