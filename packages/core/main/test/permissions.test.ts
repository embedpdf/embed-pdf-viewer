import { describe, expect, it } from 'vitest';
import { EngineError, PermissionDenied } from '@embedpdf/engine-core/runtime';
import type { DocumentHandle } from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import { PluginError, toPluginError, toPluginErrorInfo } from '../src/errors';
import { createTestContext } from '../src/testing';
import type { AnyPlugin, PluginContext, PluginScope } from '../src/types';
import { bytesInput, immediateEngine, makeHandle } from './helpers';

/**
 * A refused call names the missing permission, whoever refused it: the
 * plugin's own check (`ctx.assertAllowed`) or the engine.
 */

/** A document whose session holds `granted`, and may create annotations when `mayCreate`. */
function documentWith(granted: readonly string[], mayCreate = false): DocumentHandle {
  return Object.assign(makeHandle('d'), {
    security: {
      allows: (capability: string) => granted.includes(capability),
      allowsAnnotation: (action: string) => action === 'create' && mayCreate,
    },
    metadata: { update: () => Promise.reject(new PermissionDenied('doc.metadata.modify')) },
  }) as DocumentHandle;
}

/** A plugin that hands out its context, in the given scope. */
function probe(scope: PluginScope) {
  const seen: { ctx: PluginContext<unknown> | null } = { ctx: null };
  const plugin: AnyPlugin = {
    id: 'probe',
    scope,
    token: createCapabilityToken<unknown>('probe'),
    create: (ctx: PluginContext<unknown>) => {
      seen.ctx = ctx;
      return { api: {} };
    },
  };
  return { plugin, context: () => seen.ctx! };
}

async function openedWith(handle: DocumentHandle) {
  const { plugin, context } = probe('document');
  const kernel = createKernel({ engine: immediateEngine({ d: handle }), plugins: [plugin] });
  await kernel.start();
  await kernel.documents.open(bytesInput('d'));
  return { kernel, ctx: context() };
}

describe('ctx.allows', () => {
  it('answers from the bound document’s session, annotation create included', async () => {
    const { kernel, ctx } = await openedWith(documentWith(['doc.forms.fill'], true));
    expect(ctx.allows('doc.forms.fill')).toBe(true);
    expect(ctx.allows('doc.render')).toBe(false);
    expect(ctx.allows('annotations:create')).toBe(true);
    await kernel.destroy();

    const refused = await openedWith(documentWith([], false));
    expect(refused.ctx.allows('annotations:create')).toBe(false);
    await refused.kernel.destroy();
  });
});

describe('ctx.assertAllowed', () => {
  it('passes when the session holds the permission', async () => {
    const { kernel, ctx } = await openedWith(documentWith(['doc.forms.fill']));
    expect(() => ctx.assertAllowed('doc.forms.fill', 'setValue')).not.toThrow();
    await kernel.destroy();
  });

  it('throws permission-denied naming the missing permission', async () => {
    const { kernel, ctx } = await openedWith(documentWith([]));
    let thrown: unknown;
    try {
      ctx.assertAllowed('doc.forms.fill', 'setValue');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PluginError);
    expect(thrown).toMatchObject({
      code: 'permission-denied',
      capability: 'probe',
      permission: 'doc.forms.fill',
      message: 'setValue requires doc.forms.fill',
    });
    expect(toPluginErrorInfo(thrown as PluginError).permission).toBe('doc.forms.fill');
    expect(() => ctx.assertAllowed('annotations:create', 'create')).toThrow(
      expect.objectContaining({ permission: 'annotations:create' }),
    );
    await kernel.destroy();
  });

  it('throws in a workspace context, which has no bound document, as reading doc does', async () => {
    const { plugin, context } = probe('workspace');
    const kernel = createKernel({ engine: immediateEngine(), plugins: [plugin] });
    await kernel.start();
    const ctx = context();
    expect(() => ctx.allows('doc.print')).toThrow(/has no bound document/);
    expect(() => ctx.assertAllowed('doc.print', 'print')).toThrow(/has no bound document/);
    await kernel.destroy();
  });

  it('the test context answers the same way', () => {
    const ctx = createTestContext({
      id: 'probe',
      doc: { security: { allows: () => false, allowsAnnotation: () => false } } as never,
    });
    expect(ctx.allows('doc.render')).toBe(false);
    expect(() => ctx.assertAllowed('doc.render', 'render')).toThrow(
      expect.objectContaining({ code: 'permission-denied', permission: 'doc.render' }),
    );
    expect(createTestContext().allows('annotations:create')).toBe(true);
  });
});

describe('an engine refusal', () => {
  it('names the permission on the error a guarded call rejects with', async () => {
    const { kernel, ctx } = await openedWith(documentWith([]));
    await expect(ctx.doc.metadata.update({})).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'doc.metadata.modify',
    });
    await kernel.destroy();
  });

  it('names what was required, from PermissionDenied or from its serialized form', () => {
    const denied = toPluginError('probe', new PermissionDenied('doc.render', 'engine-local'));
    expect(denied).toMatchObject({ code: 'permission-denied', permission: 'doc.render' });
    expect(denied.details).toMatchObject({ required: 'doc.render', context: 'engine-local' });

    // Any of several would have done: the first is named, the rest stay in details.
    const anyOf = toPluginError(
      'probe',
      new PermissionDenied('doc.text.copy', undefined, ['doc.text.copy', 'doc.text.search']),
    );
    expect(anyOf.permission).toBe('doc.text.copy');
    expect(anyOf.details).toMatchObject({ anyOf: ['doc.text.copy', 'doc.text.search'] });

    // From a worker or the server the refusal arrives as a plain EngineError.
    const remote = new EngineError('Forbidden', 'permission denied', {
      details: { required: 'annotations:update' },
    });
    expect(toPluginError('probe', remote).permission).toBe('annotations:update');
  });

  it('leaves permission null on every other error', () => {
    expect(toPluginError('probe', new EngineError('NotFound', 'gone')).permission).toBeNull();
    expect(toPluginError('probe', new EngineError('DocPasswordRequired')).permission).toBeNull();
    expect(new PluginError('not-found', 'probe', 'gone').permission).toBeNull();
    expect(toPluginErrorInfo(new PluginError('not-found', 'probe', 'gone'))).toEqual({
      code: 'not-found',
      message: 'gone',
      capability: 'probe',
      permission: null,
    });
  });
});
