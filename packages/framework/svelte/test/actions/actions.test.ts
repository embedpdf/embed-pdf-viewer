import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTIONS_DEFAULTS,
  ActionsToken,
  actionsPlugin,
  useActions,
  useActionsEvent,
  useActionsSettings,
  useActionsUiAdapter,
} from '../../src/actions';
import type { ActionContext, ActionsUiHandlers, PdfActionTree } from '../../src/actions';
import type { CurrentValue } from '../../src/runtime';
import { bytesInput } from '../fixtures/counter-plugin';
import { metadataEngine } from '../fixtures/metadata-engine';
import Probes from '../fixtures/Probes.svelte';
import Toggled from '../fixtures/Toggled.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The actions readers against a real kernel: the API's settings calls before any document opens,
 * the settings as a reactive object and as a selected value, and the UI adapter's install,
 * late-read handlers, and removal when its component goes away.
 */

const plugins = [actionsPlugin({ openSequence: 'off' })];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen };
};

describe('useActions outside a document', () => {
  it('reads the settings, which belong to the plugin, while a verb says no document is open', async () => {
    let actions: ReturnType<typeof useActions> | null = null;
    const capture = probe(
      () => (actions = useActions()),
      () => 0,
    );
    await viewerWith(plugins, Probes, { probes: [capture] }, metadataEngine);
    expect(actions!.getSettings()).toEqual({ ...ACTIONS_DEFAULTS, openSequence: 'off' });
    expect(() => actions!.isScriptingEnabled()).toThrow(
      expect.objectContaining({ code: 'not-ready' }),
    );
  });
});

describe('useActionsSettings', () => {
  it('reads the settings before any document opens, and follows a change made then', async () => {
    const settings = probe(
      () => useActionsSettings(),
      (record) => ({ policy: record.policy, openSequence: record.openSequence }),
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [settings] }, metadataEngine);
    expect(kernel.documents.list()).toEqual([]);
    expect(latest(settings.seen)).toEqual({
      policy: ACTIONS_DEFAULTS.policy,
      openSequence: 'off',
    });

    kernel.settingsOf(ActionsToken).updateSettings({ policy: { uri: { hover: 'block' } } });
    flushSync();
    expect(latest(settings.seen)).toMatchObject({
      policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'report' } },
    });
  });

  it('with a selector, gives the value it picks as { current }', async () => {
    const policies = probe(
      () => useActionsSettings((settings) => settings.policy.uri),
      (uri: CurrentValue<unknown>) => uri.current,
    );
    await viewerWith(plugins, Probes, { probes: [policies] }, metadataEngine);
    expect(latest(policies.seen)).toEqual(ACTIONS_DEFAULTS.policy.uri);
  });
});

describe('useActionsUiAdapter', () => {
  /** A link to a website, clicked: the default rules hand it to the adapter. */
  const websiteLink: PdfActionTree = {
    root: { type: 'uri', subtype: 'URI', uri: 'https://example.com', isMap: false, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  };
  const click: ActionContext = {
    origin: 'user',
    source: { kind: 'api' },
    event: { scope: 'activate' },
  };

  it('installs the adapter for the document, reads the handlers late, and removes it with the component', async () => {
    const opened: string[] = [];
    const diagnostics: string[] = [];
    let handlers: ActionsUiHandlers = { openUri: (uri) => opened.push(`first ${uri}`) };
    const adapter = probe(
      () => useActionsUiAdapter(() => handlers),
      () => 0,
    );
    const listener = probe(
      () =>
        useActionsEvent(
          (actions) => actions.onDiagnosticReported,
          ({ code }) => diagnostics.push(code),
        ),
      () => 0,
    );
    const control: { hide?: () => void } = {};
    const { kernel } = await viewerWith(
      plugins,
      Toggled,
      { probes: [adapter], kept: [listener], control },
      metadataEngine,
    );
    await kernel.documents.open(bytesInput('doc'));
    flushSync();
    const actions = kernel.capability(ActionsToken);

    await actions.execute(websiteLink, click);
    expect(opened).toEqual(['first https://example.com']);

    // New handlers take effect at once, without installing the adapter again.
    const install = vi.spyOn(actions, 'setUiAdapter');
    handlers = { openUri: (uri) => opened.push(`second ${uri}`) };
    flushSync();
    await actions.execute(websiteLink, click);
    expect(opened).toEqual(['first https://example.com', 'second https://example.com']);
    expect(install).not.toHaveBeenCalled();
    install.mockRestore();

    // Gone with its component: the link is reported instead of opened.
    control.hide!();
    flushSync();
    await actions.execute(websiteLink, click);
    expect(opened).toHaveLength(2);
    expect(diagnostics).toContain('no-adapter');
  });

  it('installs it again for the next document in scope', async () => {
    const opened: string[] = [];
    const adapter = probe(
      () => useActionsUiAdapter({ openUri: (uri) => opened.push(uri) }),
      () => 0,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [adapter] }, metadataEngine);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('b');
    flushSync();

    await kernel.capability(ActionsToken, 'b').execute(websiteLink, click);
    expect(opened).toEqual(['https://example.com']);
  });
});
