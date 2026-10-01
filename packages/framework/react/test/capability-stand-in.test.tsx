// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import { PluginError, createCapabilityToken, isPluginError } from '@embedpdf/core';
import type { AnyPlugin } from '@embedpdf/core';
import { useCapability, useSelector } from '../src/runtime';
import { CounterToken, bytesInput, counterPlugin, viewerWith } from './counter-plugin';
import type { CounterCapability } from './counter-plugin';

/**
 * `useCapability` outside a document: a document plugin resolves to a stand-in
 * that renders and whose methods throw `not-ready`; a workspace plugin always
 * resolves; a token no plugin provides, and the strict `useSelector`, still
 * throw the kernel's reason.
 */

const WorkspaceToken = createCapabilityToken<{ ping(): string }>('workspace-probe');
const workspacePlugin: AnyPlugin = {
  id: 'workspace-probe',
  token: WorkspaceToken,
  create: () => ({ api: { ping: () => 'pong' } }),
};
const plugins = [counterPlugin, workspacePlugin];

function CounterProbe({ seen }: { seen: CounterCapability[] }) {
  seen.push(useCapability(CounterToken));
  return null;
}

/** Catches what its children throw while rendering, and shows the message. */
class Boundary extends React.Component<{ children: React.ReactNode }, { message: string | null }> {
  override state = { message: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  override render() {
    return this.state.message === null ? (
      this.props.children
    ) : (
      <div data-testid="caught">{this.state.message}</div>
    );
  }
}

const refusal = (call: () => unknown): unknown => {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
};

afterEach(cleanup);

describe('useCapability without a document', () => {
  it('renders a stand-in whose methods throw not-ready, then the capability once a document is ready', async () => {
    const seen: CounterCapability[] = [];
    const { kernel } = await viewerWith(plugins, <CounterProbe seen={seen} />);
    const standIn = seen[seen.length - 1];

    const error = refusal(() => standIn.increment());
    expect(error).toBeInstanceOf(PluginError);
    expect(isPluginError(error, 'not-ready')).toBe(true);
    expect((error as PluginError).capability).toBe('counter');
    expect((error as PluginError).message).toBe('no document is open');
    // Namespaces are stand-ins too.
    expect(
      isPluginError(
        refusal(() => standIn.notes.add('note')),
        'not-ready',
      ),
    ).toBe(true);

    await act(() => kernel.documents.open(bytesInput('a')));
    expect(seen[seen.length - 1]).toBe(kernel.capability(CounterToken));

    await act(() => kernel.documents.close('a'));
    expect(seen[seen.length - 1]).toBe(standIn);
  });

  it('is one stand-in per token, with stable members, and no thenable', async () => {
    const first: CounterCapability[] = [];
    const second: CounterCapability[] = [];
    const { rerender } = await viewerWith(
      plugins,
      <>
        <CounterProbe seen={first} />
        <CounterProbe seen={second} />
      </>,
    );
    rerender(
      <>
        <CounterProbe seen={first} />
        <CounterProbe seen={second} />
      </>,
    );
    expect(first.length).toBeGreaterThan(1);
    expect(new Set([...first, ...second]).size).toBe(1);

    const standIn = first[0];
    expect(standIn.increment).toBe(standIn.increment);
    expect(standIn.notes).toBe(standIn.notes);
    expect(standIn.notes.add).toBe(standIn.notes.add);
    expect((standIn as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(standIn)).resolves.toBe(standIn);
  });

  it('refuses the settings calls with not-ready for a plugin whose definition declares no settings', async () => {
    const PlainToken = createCapabilityToken<{ getSettings(): object }>('plain-probe');
    const plainPlugin: AnyPlugin = {
      id: 'plain-probe',
      token: PlainToken,
      scope: 'document',
      create: () => ({ api: { getSettings: () => ({}) } }),
    };
    const seen: { getSettings(): object }[] = [];
    function PlainProbe() {
      seen.push(useCapability(PlainToken));
      return null;
    }
    await viewerWith([...plugins, plainPlugin], <PlainProbe />);
    expect(isPluginError(refusal(() => seen[seen.length - 1].getSettings()), 'not-ready')).toBe(true);
  });

  it('resolves a workspace plugin with no document', async () => {
    const pings: string[] = [];
    function WorkspaceProbe() {
      pings.push(useCapability(WorkspaceToken).ping());
      return null;
    }
    await viewerWith(plugins, <WorkspaceProbe />);
    expect(pings).toContain('pong');
  });

  it("still throws the kernel's reason for a token no plugin provides, and from useSelector", async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const MissingToken = createCapabilityToken<{ ping(): string }>('missing');
    function MissingProbe() {
      useCapability(MissingToken);
      return null;
    }
    function SelectorProbe() {
      useSelector(CounterToken, (counter) => counter.getCount());
      return null;
    }

    const missing = await viewerWith(
      plugins,
      <Boundary>
        <MissingProbe />
      </Boundary>,
    );
    await waitFor(() => expect(document.body.textContent).toContain('No capability "missing"'));
    missing.rerender(null);
    cleanup();

    await viewerWith(
      plugins,
      <Boundary>
        <SelectorProbe />
      </Boundary>,
    );
    await waitFor(() =>
      expect(document.body.textContent).toContain('"counter" requires an active document'),
    );
    quiet.mockRestore();
  });
});
