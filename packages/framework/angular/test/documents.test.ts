/**
 * The services of the documents pages, against a real kernel: metadata (`fields()` and the
 * `custom` namespace, which is never itself a signal), page editing, the actions with their
 * settings and `withActionsUi()`, and the view manager's panes. Plus what every service's
 * checks do: a `can…()` read in a template or a `computed()` follows the document.
 */
import { ChangeDetectionStrategy, Component, computed, inject, Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPluginError } from '@embedpdf/core';
import type { DocumentHandle, DocumentMetadata, Engine } from '@embedpdf/core';
import { EpdfDocumentGate, EpdfDocumentScope, resetDevWarnings } from '@embedpdf/angular/runtime';
import { EpdfMetadata, withMetadata } from '@embedpdf/angular/metadata';
import { EpdfPageEdit, withPageEdit } from '@embedpdf/angular/page-edit';
import {
  ACTIONS_DEFAULTS,
  EpdfActions,
  withActions,
  withActionsUi,
  type ActionContext,
  type PdfActionTree,
} from '@embedpdf/angular/actions';
import { EpdfViewManager, withViewManager } from '@embedpdf/angular/view-manager';
import { bytesInput, handleFor, kernelOf, mount, viewerHost } from './fixtures';

afterEach(() => TestBed.resetTestingModule());

const METADATA: DocumentMetadata = {
  title: 'Q2 Proposal',
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  createdAt: null,
  modifiedAt: null,
  trapped: 'unknown',
};

/**
 * An engine whose documents have metadata and your own fields. A document whose id starts with
 * `read-only` may do nothing but open: every permission check says no.
 */
function documentsEngine() {
  let reads = 0;
  const engine = {
    open: (input: { id?: string }) => {
      const id = input.id ?? 'doc';
      const allowed = !id.startsWith('read-only');
      return Promise.resolve({
        ...handleFor(id, 3),
        security: { allows: () => allowed, allowsAnnotation: () => allowed },
        metadata: {
          get: () => Promise.resolve({ ...METADATA, title: `${METADATA.title} ${++reads}` }),
          custom: { get: () => Promise.resolve({ contractId: 'C-2026-114' }) },
        },
      } as unknown as DocumentHandle);
    },
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  return engine;
}

const refusal = (call: () => unknown): unknown => {
  try {
    call();
  } catch (error) {
    return error;
  }
  return null;
};

/** Wait until the plugins' first reads have landed. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EpdfMetadata', () => {
  it('reads fields(), status() and custom.fields(): empty with no document, the document’s once loaded', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withMetadata()],
        config: { engine: documentsEngine() },
      }),
    );
    const metadata = fixture.debugElement.injector.get(EpdfMetadata);
    expect(metadata.fields()).toBeNull();
    expect(metadata.status()).toBe('idle');
    expect(metadata.custom.fields()).toBeNull();
    expect(metadata.custom.status()).toBe('idle');

    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle();
    expect(metadata.fields()).toEqual({ ...METADATA, title: 'Q2 Proposal 1' });
    expect(metadata.status()).toBe('ready');
    expect(metadata.custom.fields()).toEqual({ contractId: 'C-2026-114' });
    expect(metadata.custom.status()).toBe('ready');
  });

  it('has `custom` as a namespace, never a signal, whose calls refuse not-ready with no document', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withMetadata()],
        config: { engine: documentsEngine() },
      }),
    );
    const metadata = fixture.debugElement.injector.get(EpdfMetadata);
    expect(typeof metadata.custom).toBe('object');
    // A call that returns a promise rejects, so `.catch()` sees the refusal; a check throws.
    await expect(metadata.custom.update({})).rejects.toMatchObject({ code: 'not-ready' });
    expect(
      isPluginError(
        refusal(() => metadata.canUpdate()),
        'not-ready',
      ),
    ).toBe(true);
    // Kept in a field, a namespace's call acts on the document current when it's called.
    const refresh = metadata.custom.refresh;
    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle();
    await expect(refresh()).resolves.toBeUndefined();
  });

  it('streams resynced$ and custom.resynced$ when the fields are read from the file again', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withMetadata()],
        config: { engine: documentsEngine() },
      }),
    );
    const metadata = fixture.debugElement.injector.get(EpdfMetadata);
    const titles: (string | null)[] = [];
    const custom: unknown[] = [];
    metadata.resynced$.subscribe(({ metadata: fields }) => titles.push(fields.title));
    metadata.custom.resynced$.subscribe((event) => custom.push(event.custom));

    await kernelOf(fixture).documents.open(bytesInput('a'));
    await settle();
    await metadata.refresh();
    expect(titles).toEqual(['Q2 Proposal 1', 'Q2 Proposal 2']);
    expect(metadata.fields()?.title).toBe('Q2 Proposal 2');
    expect(custom).toEqual([{ contractId: 'C-2026-114' }]);
  });
});

describe('a check', () => {
  it('read in a computed() follows the active document, and wakes it only when the answer changes', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withMetadata(), withPageEdit()],
        config: { engine: documentsEngine() },
      }),
    );
    const metadata = fixture.debugElement.injector.get(EpdfMetadata);
    const pageEdit = fixture.debugElement.injector.get(EpdfPageEdit);
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('read-only'));

    let reads = 0;
    const canUpdate = computed(() => (reads++, metadata.canUpdate()));
    const canEdit = computed(() => pageEdit.canEdit());
    expect([canUpdate(), canEdit()]).toEqual([false, false]);

    kernel.documents.rename('read-only', 'Archive'); // a change that doesn't touch the answer
    expect(canUpdate()).toBe(false);
    expect(reads).toBe(1);

    kernel.documents.setActive('a');
    expect([canUpdate(), canEdit()]).toEqual([true, true]);
    expect(reads).toBe(2);
  });
});

// OnPush, as every component should be: only a signal it reads refreshes it.
@Component({
  selector: 'test-title-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button [disabled]="!metadata.canUpdate()">Rename</button>`,
})
class TitleButton {
  protected readonly metadata = inject(EpdfMetadata);
}

describe('a check in a template', () => {
  it('disables a button for the document that may not, and enables it for one that may', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentGate, TitleButton],
        template: '<test-title-button *epdfDocumentGate="let document" />',
        features: [withMetadata()],
        config: { engine: documentsEngine() },
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('read-only'));
    await fixture.whenStable();
    const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button().disabled).toBe(true);

    kernel.documents.setActive('a');
    await fixture.whenStable();
    expect(button().disabled).toBe(false);
  });
});

describe('EpdfPageEdit', () => {
  it('refuses not-ready with no document, and answers its checks for the document in scope', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withPageEdit()],
        config: { engine: documentsEngine() },
      }),
    );
    const pageEdit = fixture.debugElement.injector.get(EpdfPageEdit);
    expect(
      isPluginError(
        refusal(() => pageEdit.canExtract()),
        'not-ready',
      ),
    ).toBe(true);
    await expect(Promise.resolve().then(() => pageEdit.rotateBy([0], 90))).rejects.toMatchObject({
      code: 'not-ready',
    });

    await kernelOf(fixture).documents.open(bytesInput('read-only'));
    expect(pageEdit.canEdit()).toBe(false);
    expect(pageEdit.canExtract()).toBe(false);
  });
});

/** A link to a website, as a PDF carries it, and a click on it. */
const websiteLink: PdfActionTree = {
  root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
  incomplete: false,
  warningFlags: 0,
  warnings: [],
};
const click: ActionContext = {
  origin: 'user',
  source: { kind: 'api' },
  event: { scope: 'activate' },
};

/** An app's own service that the handlers of `withActionsUi()` use. */
@Injectable()
class OpenedLinks {
  readonly uris: string[] = [];
}

describe('EpdfActions', () => {
  it('reads and changes the settings with no document: settings(), getSettings(), updateSettings()', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withActions({ openSequence: 'off' })] }),
    );
    const actions = fixture.debugElement.injector.get(EpdfActions);
    expect(actions.settings()).toEqual({ ...ACTIONS_DEFAULTS, openSequence: 'off' });
    expect(actions.getSettings()).toBe(actions.settings());

    actions.updateSettings({ policy: { uri: { hover: 'block' } } });
    expect(actions.settings().policy.uri).toEqual({
      ...ACTIONS_DEFAULTS.policy.uri,
      hover: 'block',
    });
    actions.resetSettings();
    expect(actions.settings().policy.uri).toEqual(ACTIONS_DEFAULTS.policy.uri);
  });

  it('without withActionsUi(), reports a website link as no-adapter in diagnosticReported$', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withActions({ openSequence: 'off' })] }),
    );
    const actions = fixture.debugElement.injector.get(EpdfActions);
    const codes: string[] = [];
    actions.diagnosticReported$.subscribe(({ code }) => codes.push(code));
    await kernelOf(fixture).documents.open(bytesInput('a'));

    await actions.execute(websiteLink, click);
    expect(codes).toEqual(['no-adapter']);
  });
});

describe('withActionsUi()', () => {
  it('hands the active document’s actions to the handlers, which may inject the app’s services', async () => {
    const Host = viewerHost({
      template: '',
      features: [
        withActions({ openSequence: 'off' }),
        withActionsUi(() => {
          const opened = inject(OpenedLinks);
          return { openUri: (uri) => opened.uris.push(uri) };
        }),
      ],
    });
    TestBed.overrideComponent(Host, { add: { providers: [OpenedLinks] } });
    const fixture = await mount(Host);
    const actions = fixture.debugElement.injector.get(EpdfActions);
    const kernel = kernelOf(fixture);

    await kernel.documents.open(bytesInput('a'));
    await actions.execute(websiteLink, click);
    await kernel.documents.open(bytesInput('b')); // the adapter moves to the new active document
    await actions.execute(websiteLink, click);
    expect(fixture.debugElement.injector.get(OpenedLinks).uris).toEqual([
      'https://www.embedpdf.com',
      'https://www.embedpdf.com',
    ]);
  });

  it('warns, once, when there is no withActions() to give the handlers to', async () => {
    resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mount(viewerHost({ template: '', features: [withActionsUi()] }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Add withActions()'));
    warn.mockRestore();
  });
});

@Component({ selector: 'test-panes-probe', template: '' })
class PanesProbe {
  readonly views = inject(EpdfViewManager);
}

describe('EpdfViewManager', () => {
  it('has the panes as signals, the calls that split them, and paneCreated$', async () => {
    const fixture = await mount(viewerHost({ template: '', features: [withViewManager()] }));
    const views = fixture.debugElement.injector.get(EpdfViewManager);
    const created: string[] = [];
    views.paneCreated$.subscribe(({ paneId }) => created.push(paneId));

    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    expect(views.panes()).toHaveLength(1);
    expect(views.panes()[0].documentIds).toEqual(['a', 'b']);
    expect(views.focusedPaneId()).toBe(views.panes()[0].id);

    const paneId = views.splitPane('b');
    expect(views.panes().map((pane) => pane.documentIds)).toEqual([['a'], ['b']]);
    expect(views.focusedPaneId()).toBe(paneId);
    expect(created).toContain(paneId);
  });

  it('reads the same panes under a document scope: the plugin belongs to the whole viewer', async () => {
    const fixture = await mount(
      viewerHost({
        imports: [EpdfDocumentScope, PanesProbe],
        template: `<div [epdfDocumentScope]="'b'"><test-panes-probe /></div>`,
        features: [withViewManager()],
      }),
    );
    const kernel = kernelOf(fixture);
    await kernel.documents.open(bytesInput('a'));
    await kernel.documents.open(bytesInput('b'));
    await fixture.whenStable();
    const scoped = fixture.debugElement.query(By.directive(PanesProbe)).componentInstance.views;
    const views = fixture.debugElement.injector.get(EpdfViewManager);
    expect(scoped).not.toBe(views);
    expect(scoped.panes()).toBe(views.panes());
    expect(scoped.getPaneOfDocument('a')).toBe(views.panes()[0].id);
  });
});
