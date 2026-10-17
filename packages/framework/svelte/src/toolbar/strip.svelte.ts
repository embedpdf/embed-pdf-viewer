/**
 * `useStripView(bar)`: a bar projected through the command registry, live and unmeasured.
 * `<Toolbar>`'s sibling, for a contextual strip (a chrome schema's `strips`) that has no width to
 * fit into.
 */
import { normalizeBar, sameStripGroups, stripGroupsOf } from '@embedpdf/core-ui';
import type {
  BarSchema,
  StripView as StripViewOf,
  StripViewGroup as StripViewGroupOf,
} from '@embedpdf/core-ui';
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { resolvedCommandsEqual } from '@embedpdf/plugin-commands/contract';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import { useCapability, useDocumentId, useKernelValue } from '../runtime/readers.svelte';
import {
  currentOf,
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';

/** A group of a strip: its visible commands, in bar order. Groups are separator boundaries. */
export type StripViewGroup = StripViewGroupOf<ResolvedCommand>;

/** A strip, resolved: only visible commands, only groups with one; `execute` runs one for this component's document. */
export type StripView = StripViewOf<ResolvedCommand>;

const sameGroups = (left: readonly StripViewGroup[], right: readonly StripViewGroup[]): boolean =>
  sameStripGroups(left, right, resolvedCommandsEqual);

const NO_GROUPS: readonly StripViewGroup[] = Object.freeze([]);

/**
 * The strip a bar shows now, as `{ current }`: the schema says what could appear, each command's
 * `visible` decides what does. `null` while nothing applies, so `{#if strip.current}` is all the
 * show-and-hide logic a strip needs. `current` changes only when a command in it changes. Pass a
 * function for a bar that changes.
 */
export function useStripView(
  bar: MaybeGetter<BarSchema | undefined>,
): CurrentValue<StripView | null> {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const normalized = $derived.by(() => {
    const schema = valueOf(bar);
    return schema ? normalizeBar(schema) : null;
  });
  const groups = useKernelValue(
    () =>
      normalized
        ? stripGroupsOf(normalized, (id) =>
            commands.resolveCommand(id, documentId.current ?? undefined),
          )
        : NO_GROUPS,
    sameGroups,
  );
  return currentOf(
    derivedValue(() =>
      groups.current.length === 0
        ? null
        : {
            groups: groups.current,
            execute: (id: string) =>
              void commands.execute(id, { documentId: documentId.current ?? undefined }),
          },
    ),
  );
}
