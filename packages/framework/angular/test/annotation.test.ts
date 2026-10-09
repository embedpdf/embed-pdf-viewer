/**
 * The annotation binding over a real kernel and engine (React's annotation-layer and
 * free-text-editing tests, the Angular way): a look's template gets the record, its frame and
 * the hover, and draws into a frame placed, turned and scaled like the annotation; an
 * interactive look takes the pointer and one that only draws stays inert; the app's handles
 * draw in place of the layer's; the chrome paints through its CSS variables; the service's
 * signals, `anchorOf()` and `[epdfRichTextEditor]` follow the annotation; typing in the layer's
 * own text box shows at once and writes once; the comments service and `withFilePicker()`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  inject,
  signal,
  type Provider,
  type Type,
  type WritableSignal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { annotationKey, type Engine, type Kernel } from '@embedpdf/core';
import { pageTransform, type PageRotation } from '@embedpdf/core-geometry';
import { createLocalEngine } from '@embedpdf/engine';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import {
  createPageContext,
  EPDF_PAGE,
  EpdfKernelHost,
  provideEmbedPdf,
  type EmbedPdfFeature,
  type EpdfPageContext,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR, type EpdfProjectorBinding } from '@embedpdf/angular/anchored';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import {
  ANNOTATION_DEFAULTS,
  annotationState,
  EpdfAnnotation,
  EpdfAnnotationDraftMenu,
  EpdfAnnotationLayer,
  EpdfAnnotationMenu,
  EpdfAnnotationTemplate,
  EpdfComments,
  EpdfHandleTemplate,
  EpdfRichTextEditor,
  withAnnotation,
  withFilePicker,
  type Annotation,
  type AnnotationRef,
  type FilePickerProvider,
} from '@embedpdf/angular/annotation';
import { kernelOf, mount, viewerHost } from './fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..');
const fixturePath = resolve(packages, '..', 'examples', 'engine-runtime-demo', 'public', 'annotations.pdf');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

// ── a page over a real document ──────────────────────────────────────────────

/** The page the next `<test-page>` shows: set before the host draws it. */
let shownPage: EpdfPageContext | null = null;

/** A page, as a Stage gives one to the layers in its page template. */
@Component({
  selector: 'test-page',
  providers: [{ provide: EPDF_PAGE, useFactory: () => shownPage }],
  host: { style: 'position: relative; display: block' },
  template: '<ng-content />',
})
class TestPage {}

interface AnnotationHost {
  readonly viewer: EpdfKernelHost;
  readonly ready: WritableSignal<boolean>;
}

/**
 * A component that provides a viewer over `annotations.pdf` and, once its page is set, draws
 * `template` in it. `members` become the host's fields, for the template to read.
 */
function annotationHost(
  engine: Engine,
  template: string,
  members: Record<string, unknown> = {},
  features: EmbedPdfFeature[],
  providers: Provider[],
  bytes: Uint8Array,
): Type<AnnotationHost> {
  @Component({
    selector: 'test-annotation-host',
    imports: [
      NgTemplateOutlet,
      TestPage,
      EpdfAnnotationLayer,
      EpdfAnnotationTemplate,
      EpdfHandleTemplate,
      EpdfRichTextEditor,
      EpdfAnnotationMenu,
      EpdfAnnotationDraftMenu,
    ],
    providers: [
      ...providers,
      provideEmbedPdf(
        { engine, initialDocuments: [{ source: { kind: 'bytes', id: 'notes', bytes } }] },
        withInteraction(),
        withAnnotation(),
        ...features,
      ),
    ],
    template: `@if (ready()) { <test-page>${template}</test-page> }`,
  })
  class Host {
    readonly viewer = inject(EpdfKernelHost);
    readonly ready = signal(false);
    constructor() {
      Object.assign(this, members);
    }
  }
  return Host;
}

/** What each mount started, to close in order: the documents, the viewer, then the engine. */
const started: { kernel: Kernel; engine: Engine }[] = [];

async function teardown(): Promise<void> {
  const mounts = started.splice(0);
  // Close the documents while the engine is there, so the viewer's teardown has none to close.
  await Promise.all(mounts.map(({ kernel }) => kernel.documents.closeAll().catch(() => {})));
  TestBed.resetTestingModule();
  shownPage = null;
  await Promise.all(mounts.map(({ engine }) => engine.destroy()));
}

/**
 * Mount `template` on the document's first page, at `rotation` and `zoom` (against a 100% of one
 * pixel per point), once every annotation is in.
 */
async function mountPage(
  template: string,
  options: {
    members?: Record<string, unknown>;
    features?: EmbedPdfFeature[];
    providers?: Provider[];
    rotation?: PageRotation;
    zoom?: number;
  } = {},
) {
  const bytes = new Uint8Array(await readFile(fixturePath));
  // happy-dom's browser-shaped globals would steer the default wasm resolution toward fetch();
  // hand the binary over directly instead.
  const wasmBinary = new Uint8Array(await readFile(wasmPath));
  const engine = await createLocalEngine({ runtime: { prefer: 'wasm', wasmBinary } });
  const fixture = (await mount(
    annotationHost(
      engine,
      template,
      options.members,
      options.features ?? [],
      options.providers ?? [],
      bytes,
    ),
  )) as ComponentFixture<AnnotationHost>;
  let kernel: Kernel | null = null;
  await vi.waitFor(
    () => {
      kernel = fixture.componentInstance.viewer.kernel();
      expect(kernel?.tryCapability(AnnotationHostToken, undefined)).toBeTruthy();
    },
    { timeout: 20_000, interval: 20 },
  );
  started.push({ kernel: kernel!, engine });
  const annotation = kernel!.capability(AnnotationHostToken);
  await annotation.whenSynced();
  const first = annotation.list()[0]!;
  const size = { width: 612, height: 792 };
  const documentId = kernel!.documents.getActiveId()!;
  shownPage = createPageContext({
    documentId: () => documentId,
    ref: () => first.page,
    view: () => 'test-view',
    pageIndex: signal(0),
    frame: signal({ top: 0, right: 0, bottom: 0, left: 0 }),
    transform: signal(
      pageTransform({
        pageSize: size,
        rotation: options.rotation ?? 0,
        scale: options.zoom ?? 1,
        baseScale: 1,
        dpr: 1,
      }),
    ),
    getRect: () => new DOMRect(0, 0, size.width, size.height),
  });
  fixture.componentInstance.ready.set(true);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  /** Wait until `selector` matches, after the next change detection. */
  const all = async (selector: string) => {
    await vi.waitFor(
      async () => {
        await fixture.whenStable();
        expect(root.querySelectorAll(selector).length).toBeGreaterThan(0);
      },
      { timeout: 5_000 },
    );
    return [...root.querySelectorAll<HTMLElement>(selector)];
  };
  return { fixture, annotation, root, all, page: first.page };
}

afterEach(async () => {
  await teardown();
  vi.restoreAllMocks();
});

const isFreeText = (annotation: Annotation) => annotation.subtype === 'free-text';
const isShape = (annotation: Annotation) =>
  annotation.subtype === 'square' || annotation.subtype === 'circle';
const isNote = (annotation: Annotation) => annotation.subtype === 'text';

describe('<epdf-annotation-layer>', () => {
  it('a look gets the record, the frame and the hover; your handles draw in place of the layer’s', async () => {
    const { annotation, root, all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isFreeText" let-annotation let-frame="frame"
                     let-hovered="hovered" let-selected="selected" let-interactive="interactive">
          <span class="look" [attr.data-subtype]="annotation.subtype" [attr.data-width]="frame.width"
                [attr.data-state]="hovered + ',' + selected + ',' + interactive"></span>
        </ng-template>
        <ng-template epdfHandle let-handle>
          <i class="handle" [attr.data-kind]="handle.kind"></i>
        </ng-template>
      </epdf-annotation-layer>`,
      { members: { isFreeText } },
    );
    const look = (await all('.look'))[0]!;
    expect(look.dataset['subtype']).toBe('free-text');
    expect(Number(look.dataset['width'])).toBeGreaterThan(0);
    expect(look.dataset['state']).toBe('false,false,false');

    const square = annotation.list().find(isShape);
    expect(square).toBeDefined();
    annotation.selection.set([square!.ref]);
    const handles = await all('.handle');
    expect(handles.some((handle) => handle.dataset['kind'] === 'corner')).toBe(true);
    // No handle of the layer's own: yours draw in their place.
    expect(root.querySelectorAll('svg rect[stroke-width="1.5"]')).toHaveLength(0);
    // The outline is painted through its variable, then the accent's.
    const painted = [...root.querySelectorAll('[style]')].map(
      (element) => element.getAttribute('style') ?? '',
    );
    expect(painted.some((style) => style.includes('--epdf-annotation-outline'))).toBe(true);
  }, 30_000);

  it('an interactive look takes the pointer; one that only draws stays inert', async () => {
    const { all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isFreeText" epdfAnnotationInteractive let-interactive="interactive">
          <button class="widget">{{ interactive ? 'live' : 'drawn' }}</button>
        </ng-template>
        <ng-template [epdfAnnotation]="isShape"><span class="drawn"></span></ng-template>
      </epdf-annotation-layer>`,
      { members: { isFreeText, isShape } },
    );
    const widget = (await all('.widget'))[0]!;
    expect(widget.textContent?.trim()).toBe('live');
    expect(widget.closest('[inert]')).toBeNull();
    // The frame (around the look's scaled box) takes the pointer.
    expect(widget.parentElement!.parentElement!.style.pointerEvents).toBe('auto');
    const drawn = (await all('.drawn'))[0]!;
    expect(drawn.closest('[inert]')).not.toBeNull();
  }, 30_000);

  it('the same look on every page is one renderer: interactive on all of them', async () => {
    // A Stage makes the page template, and every look in it, once per page on screen.
    const look = `<ng-template [epdfAnnotation]="isFreeText" epdfAnnotationInteractive let-interactive="interactive">
        <button class="widget">{{ interactive ? 'live' : 'drawn' }}</button>
      </ng-template>`;
    const { all } = await mountPage(
      `<epdf-annotation-layer class="one">${look}</epdf-annotation-layer>
       <epdf-annotation-layer class="two">${look}</epdf-annotation-layer>`,
      { members: { isFreeText } },
    );
    const one = await all('.one .widget');
    const two = await all('.two .widget');
    expect(two).toHaveLength(one.length);
    expect([...one, ...two].every((widget) => widget.textContent?.trim() === 'live')).toBe(true);
  }, 30_000);

  it('a look inside @if comes and goes with it', async () => {
    const mine = signal(true);
    const { fixture, root, all } = await mountPage(
      `<epdf-annotation-layer>
        @if (mine()) {
          <ng-template [epdfAnnotation]="isShape"><span class="look"></span></ng-template>
        }
      </epdf-annotation-layer>`,
      { members: { isShape, mine } },
    );
    await all('.look');
    mine.set(false);
    await fixture.whenStable();
    expect(root.querySelector('.look')).toBeNull();
    // The layer draws the shapes its own way again.
    expect(root.querySelectorAll('epdf-annotation-scene svg').length).toBeGreaterThan(0);
    mine.set(true);
    await all('.look');
  }, 30_000);

  it('an interactive function is asked with the active tool', async () => {
    const asked: string[] = [];
    const { fixture, all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isFreeText" [epdfAnnotationInteractive]="whenPanning"
                     let-interactive="interactive">
          <button class="widget">{{ interactive ? 'live' : 'drawn' }}</button>
        </ng-template>
      </epdf-annotation-layer>`,
      {
        members: {
          isFreeText,
          whenPanning: ({ toolId }: { toolId: string }) => {
            asked.push(toolId);
            return toolId === 'pan';
          },
        },
      },
    );
    expect((await all('.widget'))[0]!.textContent?.trim()).toBe('drawn');
    fixture.debugElement.injector.get(EpdfInteraction).activateTool('pan');
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.widget')?.textContent?.trim()).toBe(
        'live',
      );
    });
    expect(asked).toContain('pan');
  }, 30_000);

  it('a look draws into a frame placed and turned like the annotation', async () => {
    const { annotation, fixture, all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isShape" let-native="native">
          <span class="look"><ng-container [ngTemplateOutlet]="native" /></span>
        </ng-template>
      </epdf-annotation-layer>`,
      { members: { isShape } },
    );
    await all('.look');
    const square = annotation.list().find(isShape)!;
    // Turn it: the frame turns with it.
    await annotation.update(square.ref, { rotation: 30 });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      const look = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.look')!;
      expect(look.parentElement!.parentElement!.style.transform).toBe('rotate(30deg)');
    });
    const frame = (await all('.look'))[0]!.parentElement!.parentElement!;
    expect(parseFloat(frame.style.width)).toBeGreaterThan(0);
    // `native` draws the layer's own drawing inside the look.
    expect((await all('.look svg')).length).toBeGreaterThan(0);
  }, 30_000);

  it('on a turned page, a note drawn your way stays upright like its icon', async () => {
    const { annotation, page, all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isNote" let-frame="frame">
          <span class="note" [attr.data-rotation]="frame.rotation"></span>
        </ng-template>
      </epdf-annotation-layer>`,
      { members: { isNote }, rotation: 90 },
    );
    await annotation.create(page, {
      subtype: 'text',
      rect: { x: 100, y: 100, width: 24, height: 24 },
      contents: 'Upright',
    });
    const note = (await all('.note'))[0]!;
    // The page turns the layer a quarter; the frame turns back, so the note reads upright.
    expect(note.parentElement!.parentElement!.style.transform).toBe('rotate(270deg)');
    expect(note.dataset['rotation']).toBe('0');
  }, 30_000);

  it.each([
    [0.5, 0.5],
    [2, 1],
  ])(
    'at %s zoom a note drawn your way is drawn at its own size and scaled by %s',
    async (zoom, scale) => {
      const { annotation, page, all } = await mountPage(
        `<epdf-annotation-layer>
          <ng-template [epdfAnnotation]="isNote" let-frame="frame">
            <span class="note" [attr.data-width]="frame.width" [attr.data-scale]="frame.scale"></span>
          </ng-template>
        </epdf-annotation-layer>`,
        { members: { isNote }, zoom },
      );
      await annotation.create(page, {
        subtype: 'text',
        rect: { x: 100, y: 100, width: 24, height: 24 },
        contents: 'Scaled',
      });
      // Drawn at its 100% size, 24 pixels here, and scaled as a whole: text and all.
      const note = (await all('.note'))[0]!;
      expect(Number(note.dataset['width'])).toBeCloseTo(24);
      expect(Number(note.dataset['scale'])).toBeCloseTo(scale);
      const scaled = note.parentElement!;
      expect(scaled.style.transform).toBe(`scale(${scale})`);
      expect(parseFloat(scaled.style.width)).toBeCloseTo(24);
    },
    30_000,
  );

  it('selected(), editing(), anchorOf() and [epdfRichTextEditor] follow the annotation', async () => {
    const target = signal<AnnotationRef | null>(null);
    const { fixture, annotation, root, all } = await mountPage(
      `<epdf-annotation-layer>
        <ng-template [epdfAnnotation]="isFreeText" let-annotation>
          <div [epdfRichTextEditor]="annotation" #editor="epdfRichTextEditor"
               class="text-box" [attr.data-key]="key(annotation.ref)"
               [attr.data-editing]="editor.editing()"></div>
        </ng-template>
      </epdf-annotation-layer>`,
      { members: { isFreeText, key: annotationKey } },
    );
    const service = fixture.debugElement.injector.get(EpdfAnnotation);
    const anchor = service.anchorOf(target);
    const freeText = annotation.list().find(isFreeText)!;
    const key = annotationKey(freeText.ref);
    await all('.text-box');

    target.set(freeText.ref);
    annotation.selection.set([freeText.ref]);
    expect(service.selected()).toHaveLength(1);
    expect(anchor()).toMatchObject({ page: freeText.page });

    annotation.text.begin(freeText.ref);
    expect(service.editing()?.ref).toEqual(freeText.ref);
    const editor = () => root.querySelector<HTMLElement>(`.text-box[data-key="${key}"]`)!;
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(editor().dataset['editing']).toBe('true');
    });
    // Your element is the editor; the layer draws no text box of its own for it.
    expect(editor().getAttribute('contenteditable')).toBe('true');
    expect(root.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
    // It can take the keys and the pointer: nothing above it is inert while typing.
    expect(editor().closest('[inert]')).toBeNull();
    expect(editor().style.pointerEvents).toBe('auto');
    expect(editor().style.fontSize).toMatch(/px$/);

    await annotation.text.end();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(editor().dataset['editing']).toBe('false');
    });
    expect(editor().closest('[inert]')).not.toBeNull();
  }, 30_000);
});

// ── the menus ────────────────────────────────────────────────────────────────

/** A surface that places every box where its rect says, and shows every page. */
const surface: EpdfProjectorBinding = {
  projector: signal({
    space: 'overlay' as const,
    toScreen: (_page, rect) => rect,
    toScreenPoint: (_page, at) => at,
    viewEnv: () => ({ scale: 1, rotation: 0, zoom: 1 }),
    view: () => ({ x: 0, y: 0, width: 800, height: 900 }),
  }),
  revision: signal(0),
  shownPages: signal(null),
};

describe('<epdf-annotation-menu>', () => {
  it('shows its content next to the selection, and nothing without one', async () => {
    const { fixture, annotation, root } = await mountPage(
      `<epdf-annotation-menu placement="bottom"><button class="delete">Delete</button></epdf-annotation-menu>
       <epdf-annotation-draft-menu #menu="epdfAnnotationDraftMenu">
         <span class="draft">{{ menu.draft()?.pointCount }}</span>
       </epdf-annotation-draft-menu>`,
      { providers: [{ provide: EPDF_PROJECTOR, useValue: surface }] },
    );
    expect(root.querySelector('.delete')).toBeNull();
    expect(root.querySelector('.draft')).toBeNull();

    const square = annotation.list().find(isShape)!;
    annotation.selection.set([square.ref]);
    await fixture.whenStable();
    const button = root.querySelector<HTMLElement>('.delete');
    expect(button).not.toBeNull();
    // Under the selection's box, 15 pixels down.
    const bounds = annotation.selection.getAnchor()!.bounds;
    expect(parseFloat(button!.parentElement!.style.top)).toBeCloseTo(bounds.y + bounds.height + 15);

    annotation.selection.clear();
    await fixture.whenStable();
    expect(root.querySelector('.delete')).toBeNull();
  }, 30_000);
});

// ── typing in the layer's own text box ──────────────────────────────────────

/**
 * The layer's own text box over a real engine: the editor glue decides how often the engine is
 * written. It must show every keystroke at once and write once, after a pause or when the edit
 * ends.
 */
async function openEditor() {
  const { annotation, all } = await mountPage('<epdf-annotation-layer />');
  const freeText = annotation.list().find(isFreeText)!;
  const writes: AnnotationRef[] = [];
  annotation.onUpdated((event) => writes.push(event.annotation.ref));
  annotation.text.begin(freeText.ref);
  const editor = (await all('[contenteditable="true"]'))[0]!;
  /** Replace the editor's first line with `text`, the way the browser reports typing. */
  const type = (text: string) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) first.nodeValue = text;
    else editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { annotation, ref: freeText.ref, writes, type };
}

describe('typing in a free text box', () => {
  it('shows each keystroke at once and writes once after a pause', async () => {
    const { annotation, ref, writes, type } = await openEditor();
    type('Typed');
    type('Typed text');
    expect(annotation.get(ref)!.contents).toContain('Typed text');
    expect(writes).toHaveLength(0);

    await vi.waitFor(() => expect(writes).toHaveLength(1), { timeout: 5_000 });
    expect(annotation.get(ref)!.contents).toContain('Typed text');
    expect(annotation.isPending(ref)).toBe(false);
  }, 45_000);

  it('ending the edit writes what was typed at once', async () => {
    const { annotation, ref, writes, type } = await openEditor();
    type('Finished');
    await annotation.text.end();
    expect(writes).toHaveLength(1);
    expect(annotation.get(ref)!.contents).toContain('Finished');
  }, 45_000);
});

// ── the services ─────────────────────────────────────────────────────────────

describe('EpdfAnnotation', () => {
  it('reads empty without a document, refuses not-ready, and has its settings before one opens', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withInteraction(), withAnnotation()] }),
    );
    const annotation = fixture.debugElement.injector.get(EpdfAnnotation);
    expect({
      status: annotation.status(),
      selected: annotation.selected(),
      hovered: annotation.hovered(),
      editing: annotation.editing(),
    }).toEqual(annotationState.empty);
    expect(annotation.selection.properties()).toEqual({ properties: [], values: {}, mixed: [] });
    expect(annotation.tools.defaultsOf('ink')()).toEqual({});
    expect(() => annotation.selection.clear()).toThrow(/no document is open/);

    expect(annotation.settings().chrome).toEqual(ANNOTATION_DEFAULTS.chrome);
    annotation.updateSettings({ chrome: { accent: '#e91e63' } });
    expect(annotation.settings().chrome.accent).toBe('#e91e63');
    expect(kernelOf(fixture).documents.list()).toEqual([]);
  });

  it('watch(), tools.defaultsOf() and the streams follow the document', async () => {
    const { fixture, annotation, page } = await mountPage('');
    const service = fixture.debugElement.injector.get(EpdfAnnotation);
    const notes = service.watch({ subtype: 'text' });
    const ink = service.tools.defaultsOf('ink');
    const created: string[] = [];
    const changed: string[] = [];
    service.created$.subscribe(({ annotation: record }) => created.push(record.subtype));
    service.tools.defaultsChanged$.subscribe(({ toolId }) => changed.push(toolId));

    const before = notes().length;
    await service.create(page, {
      subtype: 'text',
      rect: { x: 100, y: 100, width: 24, height: 24 },
      contents: 'Watched',
    });
    expect(notes()).toHaveLength(before + 1);
    expect(created).toContain('text');
    // The same array while nothing changes.
    expect(notes()).toBe(notes());

    service.tools.updateDefaults('ink', { color: '#ff0000' });
    expect(ink().color).toBe('#ff0000');
    expect(changed).toEqual(['ink']);
    // The checks follow the document: the local engine allows everything.
    expect(service.canCreate()).toBe(true);
    expect(annotation.list().length).toBeGreaterThan(0);
  }, 30_000);
});

describe('EpdfComments', () => {
  it('threads() and threadOf(ref) follow the replies, with the page label', async () => {
    const { fixture, annotation, page } = await mountPage('');
    const comments = fixture.debugElement.injector.get(EpdfComments);
    const { annotation: note } = await annotation.create(page, {
      subtype: 'text',
      rect: { x: 300, y: 300, width: 24, height: 24 },
      contents: 'A question',
    });
    const thread = comments.threadOf(note.ref);
    const changes: string[] = [];
    comments.threadChanged$.subscribe(({ change }) => changes.push(change));
    expect(thread()?.root.contents).toBe('A question');
    expect(thread()?.pageLabel).toBe('1');
    expect(comments.canReply(note.ref)).toBe(true);

    await comments.reply(note.ref, 'An answer');
    expect(thread()?.replies.map((reply) => reply.contents)).toEqual(['An answer']);
    expect(comments.threads().some((view) => view.root.contents === 'A question')).toBe(true);
    expect(changes).toContain('reply');
  }, 30_000);
});

describe('withFilePicker()', () => {
  it('gives the stamp tool its file from the provider; without it the click is declined', async () => {
    const provider = vi.fn<FilePickerProvider>(() => Promise.resolve(null));
    const withPicker = await mountPage('', { features: [withFilePicker(provider)] });
    withPicker.fixture.debugElement.injector.get(EpdfInteraction).activateTool('stamp');
    await vi.waitFor(() =>
      expect(withPicker.annotation.requestStampAt(withPicker.page, { x: 100, y: 100 })).toBe(true),
    );
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ toolId: 'stamp' }));
    await teardown();

    const without = await mountPage('');
    without.fixture.debugElement.injector.get(EpdfInteraction).activateTool('stamp');
    expect(without.annotation.requestStampAt(without.page, { x: 100, y: 100 })).toBe(false);
  }, 45_000);
});
