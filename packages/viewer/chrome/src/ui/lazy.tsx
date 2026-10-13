/**
 * A feature's interface, loaded on first use. Each panel, dialog and inspector that belongs to
 * one feature is a chunk of its own: it isn't part of the viewer's first load, so the pages show
 * sooner. Once a document shows and the browser is idle, the viewer fetches those chunks in the
 * background ({@link FeaturePrefetch}), one per idle moment, so the first open is instant in
 * practice; one opened before that loads right then. Until its chunk arrives a component draws
 * nothing; afterwards it renders as if it had always been there.
 *
 * A dialog or an inspector mounts with the viewer and draws itself only while its surface is
 * open; it is given `shownWhile`, a hook that says when, so its chunk isn't needed before.
 */
import { Suspense, lazy, useEffect, type ComponentType } from 'react';

interface LazyOptions {
  /** A hook: whether the component shows now. Until it first does, its chunk isn't needed. */
  readonly shownWhile?: () => boolean;
}

/** Every lazy component's chunk, as the one load it shares with its component. */
const chunks: (() => Promise<unknown>)[] = [];

/** `load`'s component, imported when it first renders (and `shownWhile` says it shows). */
export function lazyComponent<Props extends object>(
  load: () => Promise<ComponentType<Props>>,
  { shownWhile }: LazyOptions = {},
): ComponentType<Props> {
  let loading: Promise<ComponentType<Props>> | null = null;
  // One load shared by the component and the background fetch; a failed one is tried again.
  const loadOnce = () =>
    (loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    }));
  chunks.push(loadOnce);
  // `lazy` types its component's props with a ref; these components take none.
  const Loaded = lazy(async () => ({
    default: await loadOnce(),
  })) as unknown as ComponentType<Props>;
  const Lazy = (props: Props) => (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
  if (!shownWhile) return Lazy;
  return function WhenShown(props: Props) {
    return shownWhile() ? <Lazy {...props} /> : null;
  };
}

/** How long the background fetch waits for an idle moment before it fetches anyway. */
const IDLE_TIMEOUT_MS = 10_000;
/** Without idle callbacks (Safari), a pause between fetches instead. */
const NO_IDLE_DELAY_MS = 1_000;

/** Run `run` once the browser is idle: an idle callback, or a pause where there are none. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(run, NO_IDLE_DELAY_MS);
  return () => clearTimeout(timer);
}

let prefetching: 'not-yet' | 'running' | 'done' = 'not-yet';

/** Fetch every lazy chunk not loaded yet, one per idle moment. Once per page; each fetch shares its component's load. */
function prefetchChunks(): () => void {
  if (prefetching !== 'not-yet') return () => {};
  prefetching = 'running';
  const queue = [...chunks];
  let cancel: () => void = () => {};
  let stopped = false;
  const next = () => {
    const load = queue.shift();
    if (stopped) return;
    if (!load) {
      prefetching = 'done';
      return;
    }
    cancel = whenIdle(() => {
      // A chunk that fails to load (offline) is tried again when its component first renders.
      void load()
        .catch(() => {})
        .finally(next);
    });
  };
  next();
  return () => {
    stopped = true;
    cancel();
    if (prefetching === 'running') prefetching = 'not-yet';
  };
}

/**
 * Mounted where a document shows: once it has, fetches the features' chunks in the background
 * while the browser is idle. Draws nothing.
 */
export function FeaturePrefetch() {
  useEffect(() => prefetchChunks(), []);
  return null;
}
