import { describe, expect, it, vi } from 'vitest';

import { annotationHarness } from '../harness';

describe('tools.register', () => {
  it('can start from a tool registered before it', () => {
    const { capability } = annotationHarness();
    capability.tools.register({ id: 'check', subtype: 'square', defaults: { color: '#00a000' } });
    capability.tools.register({ id: 'big-check', extends: 'check' } as never);
    expect(capability.tools.get('big-check')).toMatchObject({
      subtype: 'square',
      defaults: { color: '#00a000' },
    });
  });

  it('removing a change puts the tool back, its defaults and its hub tool too', () => {
    const harness = annotationHarness();
    const { tools } = harness.capability;
    const before = tools.getDefaults('ink');
    const hub = vi.spyOn(harness.interaction, 'registerTool');

    const remove = tools.register({
      id: 'ink',
      defaults: { color: '#00a000', opacity: 0.5 },
      cursor: 'pen',
      meta: { label: 'Pen' },
    });
    expect(tools.getDefaults('ink')).toMatchObject({ color: '#00a000', opacity: 0.5 });
    expect(hub).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'ink', cursor: 'pen' }), {
      replace: true,
    });

    remove();
    expect(tools.get('ink')).toMatchObject({ id: 'ink', cursor: 'crosshair' });
    expect(tools.get('ink')?.meta).toBeUndefined();
    expect(tools.getDefaults('ink')).toEqual(before);
    expect(hub).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ink', cursor: 'crosshair' }),
      { replace: true },
    );
  });

  it('removals in any order end with the tool the first change replaced', () => {
    const { tools } = annotationHarness().capability;
    const green = tools.register({ id: 'ink', defaults: { color: '#00a000' } });
    const blue = tools.register({ id: 'ink', defaults: { color: '#0000ff' } });
    green();
    expect(tools.getDefaults('ink').color).toBe('#0000ff');
    blue();
    expect(tools.getDefaults('ink').color).toBe('#ef4444');
  });

  it('removing a tool it added takes it off the table and the hub', () => {
    const harness = annotationHarness();
    const off = vi.fn();
    vi.spyOn(harness.interaction, 'registerTool').mockReturnValue(off);
    const remove = harness.capability.tools.register({ id: 'todo', extends: 'note' });
    remove();
    expect(harness.capability.tools.get('todo')).toBeNull();
    expect(off).toHaveBeenCalledOnce();
  });

  it('a tool copied from a change keeps its copy when the change is removed', () => {
    const { tools } = annotationHarness().capability;
    const green = tools.register({ id: 'ink', defaults: { color: '#00a000' } });
    tools.register({ id: 'green-pen', extends: 'ink' });
    green();
    expect(tools.getDefaults('ink').color).toBe('#ef4444');
    expect(tools.getDefaults('green-pen').color).toBe('#00a000');
  });
});
