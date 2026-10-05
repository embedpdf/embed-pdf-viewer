/**
 * `provideEmbedPdf()` and the viewer's own services: the component that provides the viewer
 * injects it itself; the engine is borrowed or owned, made at once or loaded lazily; a failed
 * start is a status, not silence; the viewer's settings reach the documents opened after them;
 * the documents and the document in scope as signals; and `*epdfDocumentGate`'s templates.
 */
import { Component, inject, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_ENGINE_BRAND } from '@embedpdf/core/testing';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfDocumentScope,
  EpdfViewer,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import { bytesInput, fakeEngine, kernelOf, mount, viewerHost, withCounter } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

const text = (element: HTMLElement) => element.textContent?.replace(/\s+/g, ' ').trim();

describe('provideEmbedPdf() in a component’s providers', () => {
  it('lets that component inject the viewer’s services and open documents itself', async () => {
    const { engine } = fakeEngine();
    @Component({
      selector: 'test-viewer',
      providers: [
        provideEmbedPdf({ engine, initialDocuments: [{ source: bytesInput('a') }] }, withCounter()),
      ],
      template: `{{ document.id() }}: {{ document.status() }},
        {{ documents.documents().length }} open`,
    })
    class Viewer {
      protected readonly document = inject(EpdfDocument);
      protected readonly documents = inject(EpdfDocuments);
    }
    const fixture = await mount(Viewer);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(text(fixture.nativeElement)).toBe('a: ready, 1 open');
    });
  });

  it('gives each providing component its own viewer, destroyed with it', async () => {
    const first = fakeEngine();
    const host = viewerHost({ template: '', config: { engine: () => first.engine } });
    const fixture = await mount(host);
    const kernel = kernelOf(fixture);
    expect(kernel.status()).toBe('started');
    fixture.destroy();
    await vi.waitFor(() => expect(kernel.status()).toBe('destroyed'));
    // The engine came from a function, so the viewer owned it.
    await vi.waitFor(() => expect(first.destroyedCount()).toBe(1));
  });
});

describe('the engine', () => {
  it('an instance is borrowed: a local one is warmed up, never destroyed', async () => {
    const warmup = vi.fn();
    const { engine, destroyedCount } = fakeEngine();
    const local = Object.assign(engine, { [LOCAL_ENGINE_BRAND]: true, warmup }) as Engine;
    const fixture = await mount(viewerHost({ template: '', config: { engine: local } }));
    expect(warmup).toHaveBeenCalledTimes(1);
    const kernel = kernelOf(fixture);
    fixture.destroy();
    await vi.waitFor(() => expect(kernel.status()).toBe('destroyed'));
    expect(destroyedCount()).toBe(0);
  });

  it('a function may return a promise: the kernel comes when the engine does', async () => {
    const { engine, destroyedCount } = fakeEngine();
    let deliver: (engine: Engine) => void = () => {};
    const loading = new Promise<Engine>((resolve) => (deliver = resolve));
    const fixture = await mount(
      viewerHost({
        template: '{{ viewer.status() }}',
        config: { engine: () => loading, initialDocuments: [{ source: bytesInput('a') }] },
      }),
    );
    expect(fixture.componentInstance.viewer.kernel()).toBeNull();
    expect(text(fixture.nativeElement)).toBe('starting');

    deliver(engine);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(text(fixture.nativeElement)).toBe('ready');
    });
    await vi.waitFor(() => expect(kernelOf(fixture).documents.get('a')?.status).toBe('ready'));
    fixture.destroy();
    await vi.waitFor(() => expect(destroyedCount()).toBe(1));
  });

  it('a viewer gone before its engine arrives destroys the engine it made', async () => {
    const { engine, destroyedCount } = fakeEngine();
    let deliver: (engine: Engine) => void = () => {};
    const loading = new Promise<Engine>((resolve) => (deliver = resolve));
    const fixture = await mount(viewerHost({ template: '', config: { engine: () => loading } }));
    fixture.destroy();
    deliver(engine);
    await vi.waitFor(() => expect(destroyedCount()).toBe(1));
  });

  it('a failed start is the status `error`, with why', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fixture = await mount(
      viewerHost({
        template: '{{ viewer.status() }}',
        config: {
          engine: () => {
            throw new Error('no WebAssembly here');
          },
        },
      }),
    );
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('error');
    expect(String(fixture.componentInstance.viewer.error())).toContain('no WebAssembly here');
    quiet.mockRestore();
  });
});

describe('EpdfViewer', () => {
  it('starts from the config, and its changes reach the documents opened after them', async () => {
    const { engine, opened } = fakeEngine();
    @Component({ selector: 'test-viewer', template: '' })
    class Probe {}
    const fixture = await mount(
      viewerHost({
        imports: [Probe],
        template: '',
        config: { engine, identity: { userId: 'u1' }, scope: ['doc.open'], accent: '#e91e63' },
      }),
    );
    const viewer = fixture.debugElement.injector.get(EpdfViewer);
    expect(viewer.settings().accent).toBe('#e91e63');
    expect(viewer.settings().page.shadow).toBe('0 6px 18px rgb(0 0 0 / 0.18)');

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    expect(opened[0].options).toEqual({ scope: ['doc.open'], identity: { userId: 'u1' } });

    viewer.updateSettings({ identity: { userId: 'u2' }, scope: ['doc.open', 'doc.download'] });
    await kernel.documents.open(bytesInput('b'));
    expect(opened[1].options).toEqual({
      scope: ['doc.open', 'doc.download'],
      identity: { userId: 'u2' },
    });

    viewer.resetSettings();
    expect(viewer.settings().identity).toEqual({ userId: 'u1' });
  });

  it('keeps the changes made before a lazily loaded engine arrives', async () => {
    const { engine, opened } = fakeEngine();
    let deliver: (engine: Engine) => void = () => {};
    const loading = new Promise<Engine>((resolve) => (deliver = resolve));
    const fixture = await mount(
      viewerHost({
        template: '',
        config: { engine: () => loading, initialDocuments: [{ source: bytesInput('a') }] },
      }),
    );
    const viewer = fixture.debugElement.injector.get(EpdfViewer);
    viewer.updateSettings({ identity: { userId: 'late' }, page: { shadow: 'none' } });
    expect(viewer.settings().identity).toEqual({ userId: 'late' });
    expect(viewer.settings().page).toEqual({ background: '#ffffff', shadow: 'none' });

    deliver(engine);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0].options).toEqual({ identity: { userId: 'late' } });
    expect(kernelOf(fixture).getSettings().page.shadow).toBe('none');
  });
});

describe('EpdfDocuments and EpdfDocument', () => {
  it('read every document, the active one, and the one a scope names', async () => {
    @Component({
      selector: 'test-scoped',
      template: '{{ document.id() }}/{{ document.pages().length }}',
    })
    class Scoped {
      protected readonly document = inject(EpdfDocument);
    }
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentScope, Scoped],
        template: `<p [epdfDocumentScope]="'a'"><test-scoped /></p>`,
      }),
    );
    const documents = fixture.debugElement.injector.get(EpdfDocuments);
    const document = fixture.debugElement.injector.get(EpdfDocument);
    expect(document.id()).toBe('');
    expect(document.status()).toBe('loading');
    expect(documents.documents()).toEqual([]);

    await documents.open(bytesInput('a'), { name: 'Contract' });
    await documents.open(bytesInput('b'));
    expect(document.id()).toBe('b');
    expect(document.pageCount()).toBe(1);
    expect(documents.activeId()).toBe('b');
    expect(documents.documents().map((info) => info.name)).toEqual(['Contract', undefined]);
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('a/1');
  });

  it('download() without an id downloads the document in scope', async () => {
    @Component({ selector: 'test-scoped', template: '' })
    class Scoped {
      readonly documents = inject(EpdfDocuments);
    }
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentScope, Scoped],
        template: `<p [epdfDocumentScope]="'b'"><test-scoped /></p>`,
      }),
    );
    const scoped = fixture.debugElement.children[0].children[0].injector.get(Scoped).documents;
    const active = fixture.debugElement.injector.get(EpdfDocuments);
    await active.open(bytesInput('a'));
    await active.open(bytesInput('b'));
    active.setActive('a');
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    expect(decode(await scoped.download())).toBe('b');
    expect(decode(await active.download())).toBe('a');
  });

  it('openFailed$ tells why a document couldn’t be opened', async () => {
    const broken = {
      open: () => Promise.reject(new Error('corrupt file')),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const fixture = await mount(viewerHost({ template: '', config: { engine: broken } }));
    const documents = fixture.debugElement.injector.get(EpdfDocuments);
    const failures: string[] = [];
    documents.openFailed$.subscribe(({ error }) => failures.push(error.message));
    await documents.open(bytesInput('a')).catch(() => {});
    expect(failures).toEqual(['corrupt file']);
  });
});

describe('*epdfDocumentGate', () => {
  /** An engine whose `a` waits for its password, `b` fails, and `c` opens. */
  const engine = {
    open: (input: { id: string }) =>
      input.id === 'b'
        ? Promise.reject(new Error('corrupt file'))
        : input.id === 'a'
          ? Promise.resolve({
              id: 'a',
              events: { subscribe: () => () => {}, lastServerId: () => null },
              security: {
                allows: () => true,
                passwordPrompt: { state: 'required', incorrect: true },
              },
              // Calls' facts and working sets change nothing here: the same document.
              with() {
                return this;
              },
              setWorkingSet: () => {},
              close: () => Promise.resolve(),
            } as unknown as DocumentHandle)
          : fakeEngine().engine.open(input as never),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;

  it('renders its content with the ready document, and `locked`, `error` or `fallback` otherwise', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentGate],
        config: { engine },
        template: `
          <p *epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed">
            ready {{ document.id }}
          </p>
          <ng-template #opening>opening</ng-template>
          <ng-template #locked let-document>locked {{ document.passwordProvided }}</ng-template>
          <ng-template #failed let-document>failed: {{ document.error.message }}</ng-template>
        `,
      }),
    );
    const documents = fixture.debugElement.injector.get(EpdfDocuments);
    const shows = async (expected: string) =>
      vi.waitFor(async () => {
        await fixture.whenStable();
        expect(text(fixture.nativeElement)).toBe(expected);
      });
    await shows('opening');
    await documents.open(bytesInput('a'));
    await shows('locked true');
    await documents.open(bytesInput('b')).catch(() => {});
    await shows('failed: corrupt file');
    await documents.open(bytesInput('c'));
    await shows('ready c');
    const content = fixture.nativeElement.querySelector('p');
    await documents.open(bytesInput('d'));
    await shows('ready d');
    // Another ready document keeps the content; only `document` changes.
    expect(fixture.nativeElement.querySelector('p')).toBe(content);
  });

  it('without `locked` and `error`, shows `fallback` for them', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentGate],
        config: { engine },
        template: `
          <p *epdfDocumentGate="let document; fallback: opening">ready</p>
          <ng-template #opening>opening</ng-template>
        `,
      }),
    );
    await fixture.debugElement.injector.get(EpdfDocuments).open(bytesInput('a'));
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('opening');
  });
});

describe('on the server', () => {
  it('creates no kernel: the template renders, signals read empty, calls throw EPDF-105', async () => {
    let made = 0;
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: 'server' }],
    });
    const fixture = TestBed.createComponent(
      viewerHost({
        imports: [EpdfDocumentGate],
        config: { engine: () => (made++, fakeEngine().engine) },
        template: `
          <p *epdfDocumentGate="let document; fallback: placeholder">ready</p>
          <ng-template #placeholder>placeholder</ng-template>
        `,
      }),
    );
    await fixture.whenStable();
    expect(text(fixture.nativeElement)).toBe('placeholder');
    expect(made).toBe(0);
    const documents = fixture.debugElement.injector.get(EpdfDocuments);
    expect(documents.documents()).toEqual([]);
    expect(() => documents.getActiveId()).toThrow('EPDF-105');
    expect(fixture.debugElement.injector.get(EpdfViewer).settings().accent).toBe('#3858e9');
  });
});
