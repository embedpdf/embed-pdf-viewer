/** The render plugin through the real kernel, over a fake engine document. */
import {
  createCapabilityToken,
  createKernel,
  definePlugin,
  toPageRef,
  type ChangeQueue,
  type DocumentEvent,
  type CallFacts,
  type DocumentHandle,
  type Engine,
  type PageLayout,
  type PageRef,
  type AnyPlugin,
} from '@embedpdf/core';
import type { RenderConfig } from '../src/contract';
import { RenderToken } from '../src/host-contract';
import { renderPlugin } from '../src/render.plugin';

/** A page whose every box is its crop box, in page space: measured from that box's top-left. */
const everyBoxIsTheCrop = (crop: { left: number; bottom: number; right: number; top: number }) => {
  const box = { x: 0, y: 0, width: crop.right - crop.left, height: crop.top - crop.bottom };
  return { media: box, crop: box, bleed: box, trim: box, art: box };
};

export const PAGE_OBJECT_NUMBERS = [11, 22, 33];
export const CROP = { left: 0, bottom: 0, right: 612, top: 792 };

/** Minimal event shapes — only the fields the controller reads. */
export const documentEvent = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

export const LATTICE = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  appearances: { scales: [1, 2, 4] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
} as const;

/** A controllable AbortablePromise-shaped render task. */
export function makeTask() {
  let resolvePromise!: (value: unknown) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const task = Object.assign(promise, {
    aborted: undefined as unknown,
    abort(reason?: unknown) {
      task.aborted = reason ?? new Error('aborted');
      rejectPromise(task.aborted);
    },
  });
  return {
    task,
    resolve: (value: unknown) => resolvePromise(value),
    reject: (error: unknown) => rejectPromise(error),
  };
}

export const image = (key = 'handle') =>
  ({ source: { kind: 'bytes', bytes: new Uint8Array(4) }, format: 'png', key }) as unknown;

/** A plugin that hands the test the document's change queue. */
const StagerToken = createCapabilityToken<ChangeQueue>('stager');
const stagerPlugin = definePlugin({
  id: 'stager',
  scope: 'document',
  token: StagerToken,
  create: (ctx) => ({ api: ctx.changes }),
});

export async function boot(
  options: {
    policy?: unknown;
    config?: RenderConfig;
    allow?: boolean;
    /** What the session may do, by capability; `allow` for every one when absent. */
    allows?: (capability: string) => boolean;
    crop?: typeof CROP;
    /** More plugins beside the render plugin, such as the interaction hub. */
    plugins?: readonly AnyPlugin[];
  } = {},
) {
  const crop = options.crop ?? CROP;
  const pages = PAGE_OBJECT_NUMBERS.map(
    (pageObjectNumber, index) =>
      ({
        index,
        ref: toPageRef(pageObjectNumber),
        label: null,
        size: { width: crop.right - crop.left, height: crop.top - crop.bottom },
        rotation: 0,
        userUnit: 1,
        boxes: everyBoxIsTheCrop(crop),
        pdfCropBox: { ...crop },
      }) as PageLayout,
  );
  const listeners = new Set<(event: unknown) => void>();
  const imageCalls: Array<{
    pageObjectNumber: number;
    options: Record<string, unknown>;
    /** The view the render was asked for (`doc.with({ view })`), if any. */
    view?: string;
    /** Its priority (`doc.with({ priority })`), if any. */
    priority?: string;
  }> = [];
  const tasks: Array<ReturnType<typeof makeTask>> = [];
  const appearanceCalls: Array<{
    pageObjectNumber: number;
    family: 'annotations' | 'widgets';
    options: Record<string, unknown>;
  }> = [];
  const appearanceTasks: Array<ReturnType<typeof makeTask>> = [];
  // The document as a call with these facts sees it.
  const documentWith = (facts: CallFacts): DocumentHandle =>
    ({
      ...shared,
      with: (more: CallFacts) => documentWith({ ...facts, ...more }),
      setWorkingSet: () => {},
      page: (ref: PageRef) => ({
        render: {
          image: (imageOptions: Record<string, unknown>) => {
            imageCalls.push({
              pageObjectNumber: ref.objectNumber,
              options: imageOptions,
              ...(facts.view !== undefined ? { view: facts.view } : {}),
              ...(facts.priority !== undefined ? { priority: facts.priority } : {}),
            });
            const pending = makeTask();
            tasks.push(pending);
            return pending.task;
          },
        },
        ...Object.fromEntries(
          (['annotations', 'widgets'] as const).map((family) => [
            family === 'widgets' ? 'forms' : 'annotations',
            {
              renderAppearances: (appearanceOptions: Record<string, unknown>) => {
                appearanceCalls.push({
                  pageObjectNumber: ref.objectNumber,
                  family,
                  options: appearanceOptions,
                });
                const pending = makeTask();
                appearanceTasks.push(pending);
                return pending.task;
              },
            },
          ]),
        ),
      }),
    }) as unknown as DocumentHandle;
  const shared = {
    id: 'd',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerSequence: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, labels: [], pages }) },
    security: {
      allows: (capability: string) => options.allows?.(capability) ?? options.allow ?? true,
    },
    render: { getPolicy: () => Promise.resolve(options.policy ?? { kind: 'continuous' }) },
    // Changes the test stages wait for the test's answer.
    apply: () => applied.at(-1)!.task,
    close: () => Promise.resolve(),
  };
  const applied: Array<ReturnType<typeof makeTask>> = [];
  const handle = documentWith({});
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({
    engine,
    plugins: [renderPlugin(options.config), stagerPlugin, ...(options.plugins ?? [])],
  });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  const changes = kernel.capability(StagerToken, 'd');
  return {
    kernel,
    /** Stage a change on the document's queue; `answer` is the engine's. */
    stage: (change: Parameters<ChangeQueue['stage']>[0]) => {
      const answer = makeTask();
      applied.push(answer);
      changes.stage(change);
      return answer;
    },
    render: kernel.capability(RenderToken, 'd'),
    imageCalls,
    tasks,
    appearanceCalls,
    appearanceTasks,
    emit: (event: DocumentEvent) => listeners.forEach((listener) => listener(event)),
  };
}
