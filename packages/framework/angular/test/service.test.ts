/**
 * A plugin's service, as `pluginService()` builds it: each State value a signal that reads the
 * empty state without a document and changes only when its field does; the settings, with or
 * without a document; methods that refuse `not-ready` until there is one and act on the
 * document current when called; events as streams that follow the document; and the document a
 * `[epdfDocumentScope]` names.
 */
import { Component, computed, inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it } from 'vitest';
import { isPluginError } from '@embedpdf/core';
import { EpdfDocuments, EpdfDocumentScope, type EpdfError } from '@embedpdf/angular/runtime';
import { bytesInput, CounterToken, EpdfCounter, kernelOf, mount, viewerHost } from './fixtures';

const refusal = (call: () => unknown): unknown => {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
};

@Component({ selector: 'test-counter-probe', template: '' })
class CounterProbe {
  readonly counter = inject(EpdfCounter);
}

afterEach(() => TestBed.resetTestingModule());

describe('a service’s State signals', () => {
  it('read empty with no document, the state once one is ready, and empty after it closes', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    expect(counter.count()).toBe(-1);
    expect(counter.label()).toBe('');

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    expect(counter.count()).toBe(0);
    expect(counter.label()).toBe('start');

    await kernel.documents.close('a');
    expect(counter.count()).toBe(-1);
  });

  it('change only when their own field changes', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    let countReads = 0;
    let labelReads = 0;
    const count = computed(() => (countReads++, counter.count()));
    const label = computed(() => (labelReads++, counter.label()));
    count();
    label();

    kernel.capability(CounterToken).touch(); // readers wake, nothing changed
    kernel.capability(CounterToken).setLabel('start'); // a new state object, the same fields
    count();
    label();
    expect([countReads, labelReads]).toEqual([1, 1]);

    kernel.capability(CounterToken).increment();
    expect(count()).toBe(1);
    label();
    expect([countReads, labelReads]).toEqual([2, 1]);
  });

  it('follow [epdfDocumentScope], and the active document outside one', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentScope, CounterProbe],
        template: `
          <div [epdfDocumentScope]="'b'"><test-counter-probe id="scoped" /></div>
          <test-counter-probe id="active" />
        `,
      }),
    );
    const probe = (id: string) =>
      fixture.debugElement.query(By.css(`#${id}`)).injector.get(CounterProbe).counter;
    const scoped = probe('scoped');
    const active = probe('active');
    expect(scoped).not.toBe(active);

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    expect(scoped.count()).toBe(-1); // "b" isn't open yet
    expect(active.count()).toBe(0);

    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');
    scoped.increment(); // acts on "b", whichever document is active
    expect(scoped.count()).toBe(1);
    expect(active.count()).toBe(0);

    kernel.documents.setActive('b');
    expect(active.count()).toBe(1);
  });
});

describe('a service’s settings', () => {
  it('read and change with no document, and are the same settings once one is open', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const kernel = kernelOf(fixture);
    expect(counter.settings()).toBe(kernel.settingsOf(CounterToken).getSettings());

    counter.updateSettings({ step: 2 }); // before any document
    expect(counter.settings()).toEqual({ step: 2, theme: { color: 'red', width: 1 } });

    await kernel.documents.open(bytesInput('a'));
    expect(kernel.capability(CounterToken).getSettings()).toBe(counter.settings());
    counter.resetSettings();
    expect(counter.settings().step).toBe(1);
  });

  it('change only when a setting changes', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    const before = counter.settings();

    counter.increment(); // state, not settings
    counter.updateSettings({ step: 1 }); // the value it already has
    expect(counter.settings()).toBe(before);

    counter.updateSettings({ theme: { width: 3 } });
    expect(counter.settings().theme).toEqual({ color: 'red', width: 3 });
  });

  it('settingsChanged$ fires once per change', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const changes: unknown[] = [];
    const subscription = counter.settingsChanged$.subscribe(({ changed }) => changes.push(changed));
    counter.updateSettings({ step: 4 });
    counter.updateSettings({ step: 4 });
    expect(changes).toEqual([['step']]);
    subscription.unsubscribe();
  });
});

describe('a service’s methods', () => {
  it('refuse not-ready with no document, then act on the document current when called', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const increment = counter.increment; // kept in a field, as a template or callback would

    const error = refusal(() => increment());
    expect(isPluginError(error, 'not-ready')).toBe(true);
    expect((error as Error).message).toBe('no document is open');
    expect(counter.increment).toBe(increment);

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    increment();
    expect(kernel.capability(CounterToken, 'b').getCount()).toBe(1);
    kernel.documents.setActive('a');
    increment();
    expect(kernel.capability(CounterToken, 'a').getCount()).toBe(1);
  });
});

describe('the read rule', () => {
  it('a get* read in a computed follows its answer; a verb in an effect tracks nothing', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const count = computed(() => {
      try {
        return counter.getCount();
      } catch {
        return 'not-ready';
      }
    });
    expect(count()).toBe('not-ready');

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    expect(count()).toBe(0);
    kernel.capability(CounterToken).increment();
    expect(count()).toBe(1);

    let verbRuns = 0;
    const touched = computed(() => {
      verbRuns += 1;
      counter.touch();
      return verbRuns;
    });
    touched();
    kernel.capability(CounterToken).increment();
    touched();
    // Through the verb the computed depends on nothing, so it never ran again.
    expect(verbRuns).toBe(1);
  });

  it('a method that returns a promise rejects with no document, rather than throwing', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    let saving: Promise<string> | null = null;
    expect(() => (saving = counter.save('draft'))).not.toThrow();
    await expect(saving).rejects.toMatchObject({ code: 'not-ready', capability: 'counter' });

    await kernelOf(fixture).documents.open(bytesInput('a'));
    await expect(counter.save('kept')).resolves.toBe('kept');
  });
});

describe('a service’s events', () => {
  it('are streams that follow the active document', async () => {
    const fixture = await mount(viewerHost({ template: '' }));
    const counter = fixture.debugElement.injector.get(EpdfCounter);
    const counts: number[] = [];
    const subscription = counter.incremented$.subscribe(({ count }) => counts.push(count));

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    kernel.capability(CounterToken, 'a').increment();
    await kernel.documents.open(bytesInput('b'));
    kernel.capability(CounterToken, 'a').increment(); // no longer the active document
    kernel.capability(CounterToken, 'b').increment();
    expect(counts).toEqual([1, 1]);

    subscription.unsubscribe();
    kernel.capability(CounterToken, 'b').increment();
    expect(counts).toEqual([1, 1]);
  });
});

describe('setup mistakes', () => {
  it('EPDF-101: one of the viewer’s own services, with no viewer above it', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const error = refusal(() => TestBed.inject(EpdfDocuments)) as EpdfError;
    expect(error.code).toBe('EPDF-101');
    expect(error.message).toContain('provideEmbedPdf()');
    expect(error.message).toContain(
      'https://www.embedpdf.com/docs/headless/angular/errors#epdf-101',
    );
  });

  it('EPDF-102: a plugin’s service, with no viewer above it', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const error = refusal(() => TestBed.inject(EpdfCounter)) as EpdfError;
    expect(error.code).toBe('EPDF-102');
    expect(error.message).toContain('withCounter()');
  });

  it('EPDF-102: a plugin’s service where the viewer doesn’t have the plugin', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [] }));
    const error = refusal(() => fixture.debugElement.injector.get(EpdfCounter)) as EpdfError;
    expect(error.code).toBe('EPDF-102');
  });
});
