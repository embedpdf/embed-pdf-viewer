/**
 * The viewer's root element, and the layout resolved on it.
 *
 * One ResizeObserver on the root measures the viewer (its width, and from it
 * the size), a media query says whether the main pointer is a finger, and the
 * language gives the direction: together the env, and the `layout` function
 * runs again whenever it changes. The direction is the root's `dir`, so the
 * viewer reads its own language's way whatever the page around it does. Under
 * the root, the bars leave out the tab of a mode whose bars show nothing and
 * the button of a menu that shows nothing; an open mode whose tab goes falls
 * back to View; a bar with a new mode gets its `mode:<mode>` command; and each
 * problem with the layout is logged once.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  VIEW_MODE_COMMAND,
  compileBar,
  menuOf,
  modeCommandOf,
  modesOf,
  omittedCommandsOf,
  resolveLayout,
  sizeOf,
  validateLayout,
  type BarSchema,
  type Layout,
  type LayoutEnv,
  type MenuSection,
} from '@embedpdf/core-ui';
import { useCommands } from '@embedpdf/react/commands';
import { useI18nState } from '@embedpdf/react/i18n';
import {
  useDocumentId,
  useKernelValue,
  useOptionalCapability,
  useOptionalSelector,
} from '@embedpdf/react/runtime';
import { ShellToken } from '@embedpdf/react/shell';
import { observeWidth } from '@embedpdf/web';
import { defaultLayout } from './config/chrome';
import {
  modeCommandsFor,
  modeSpecsOf,
  openModeSurfaceOf,
  sameModeSpecs,
  type ModeSpec,
} from './config/modes';
import {
  DEFAULT_ENV,
  ResolvedLayoutProvider,
  stripOf,
  useLayoutOption,
  type ResolvedLayout,
} from './config-context';

const COARSE_POINTER = '(pointer: coarse)';

const isCoarsePointer = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(COARSE_POINTER).matches;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, i) => value === right[i]);

/** `value`, or the last one when it equals that one: a value that stays the same object while equal. */
function useEqualValue<T>(value: T, isEqual: (left: T, right: T) => boolean): T {
  const last = useRef(value);
  if (last.current !== value && !isEqual(last.current, value)) last.current = value;
  return last.current;
}

/**
 * The env of the element `root` points at: measured before the first paint, then on every
 * change. `null` for the first render, before there is anything to measure.
 */
function useMeasuredEnv(root: RefObject<HTMLElement | null>): LayoutEnv | null {
  const dir = useI18nState((state) => state.direction);
  const [width, setWidth] = useState<number | null>(null);
  const [touch, setTouch] = useState(isCoarsePointer);
  useLayoutEffect(() => {
    const element = root.current;
    return element
      ? observeWidth(element, (measured) => setWidth(Math.round(measured)))
      : undefined;
  }, [root]);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia(COARSE_POINTER);
    const update = () => setTouch(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return useMemo(
    () => (width === null ? null : { size: sizeOf(width), width, touch, dir }),
    [width, touch, dir],
  );
}

/**
 * The viewer's root: a `<div>` the layout is measured on, providing the resolved layout to
 * everything inside it. Its children render once per change of their own, not per resize.
 */
export function LayoutRoot({ className, children }: { className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const measured = useMeasuredEnv(root);
  // The first render, before the root is measured, lays out as a wide viewer; the measured
  // env replaces it before the browser paints.
  const env = measured ?? DEFAULT_ENV;
  const option = useLayoutOption();
  const layout = useMemo(() => resolveLayout(option, defaultLayout, env), [option, env]);
  const data = layout.toJSON();

  const commands = useCommands();
  const documentId = useDocumentId() ?? undefined;
  const omitted = useKernelValue(
    () => omittedCommandsOf(data, (id) => commands.resolveCommand(id, documentId)),
    sameStrings,
  );

  // A bar keeps its object while it stays the same, so a resize that changes nothing in it
  // doesn't make its toolbar start over.
  const compiled = useRef(new Map<string, { readonly key: string; readonly value: unknown }>());
  const resolved = useMemo<ResolvedLayout>(() => {
    const stable = <T,>(name: string, value: T): T => {
      const key = JSON.stringify(value);
      const previous = compiled.current.get(name);
      if (previous?.key === key) return previous.value as T;
      compiled.current.set(name, { key, value });
      return value;
    };
    const omit = new Set(omitted);
    const bars = new Map<string, BarSchema>();
    for (const id of Object.keys(data.bars ?? {}))
      bars.set(id, stable(`bar:${id}`, compileBar(data, id, { omit })!));
    const bar = (id: string) => bars.get(id) ?? null;
    const strips = {
      selection: stable('strip:selection', stripOf(data, 'selection', bar)),
      annotation: stable('strip:annotation', stripOf(data, 'annotation', bar)),
    };
    const menus = new Map<string, readonly MenuSection[]>();
    for (const id of Object.keys(data.menus ?? {}))
      menus.set(id, stable(`menu:${id}`, menuOf(data, id)!));
    return {
      data,
      env,
      bar,
      strip: (target) => strips[target],
      menu: (id) => menus.get(id) ?? null,
    };
  }, [data, env, omitted]);

  // The tabs on show: a mode's tab goes when its bars show nothing, and when its own command is
  // hidden (turned off with its feature, or not allowed).
  const tabs = useKernelValue(
    () =>
      modesOf(data)
        .map(modeCommandOf)
        .filter(
          (id) =>
            !omitted.includes(id) && commands.resolveCommand(id, documentId)?.visible === true,
        ),
    sameStrings,
  );

  useModeCommands(useEqualValue(modeSpecsOf(data), sameModeSpecs));
  useModeFallback(tabs);
  useLayoutWarnings(measured === null ? null : layout);

  return (
    <div ref={root} dir={env.dir} className={className}>
      <ResolvedLayoutProvider value={resolved}>{children}</ResolvedLayoutProvider>
    </div>
  );
}

/** Registers a command for each mode that has none, for as long as the layout has the mode. */
function useModeCommands(specs: readonly ModeSpec[]): void {
  const commands = useCommands();
  // Before paint, so a new mode's tab is there in the first frame.
  useLayoutEffect(() => {
    const definitions = modeCommandsFor(specs, (id) => commands.hasCommand(id));
    return definitions.length > 0 ? commands.registerCommands(definitions) : undefined;
  }, [commands, specs]);
}

/** Back to View when the open mode has no tab: its bars show nothing, or the layout lost it. */
function useModeFallback(tabs: readonly string[]): void {
  const commands = useCommands();
  const shell = useOptionalCapability(ShellToken);
  const openMode = useOptionalSelector(ShellToken, openModeSurfaceOf, null);
  useEffect(() => {
    if (openMode === null || tabs.includes(openMode)) return;
    shell?.close(openMode);
    commands.execute(VIEW_MODE_COMMAND).catch(() => {});
  }, [commands, shell, openMode, tabs]);
}

/**
 * Logs each problem with the layout once, with the closest id that exists; `null` while there is
 * no measured layout to check. The viewer still starts.
 */
function useLayoutWarnings(layout: Layout | null): void {
  const commands = useCommands();
  const logged = useRef(new Set<string>());
  useEffect(() => {
    if (layout === null) return;
    // The bundle a page loads from a CDN has no development mode, so this always runs: a typo
    // that quietly loses a button costs more than a console line.
    const problems = validateLayout(layout, {
      commands: commands.listCommandIds(),
      hasCommand: (id) => commands.hasCommand(id),
    });
    for (const problem of problems) {
      if (logged.current.has(problem)) continue;
      logged.current.add(problem);
      console.warn(`[embedpdf] layout: ${problem}`);
    }
  }, [commands, layout]);
}
