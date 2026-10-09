/**
 * `useStripView(bar)`: a bar projected through the command registry, live and
 * unmeasured. `<Toolbar>`'s sibling, for a contextual strip (a chrome schema's
 * `strips`) that has no width to fit into.
 */
import { computed, toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { normalizeBar, sameStripGroups, stripGroupsOf } from '@embedpdf/core-ui';
import type {
  BarSchema,
  StripView as StripViewOf,
  StripViewGroup as StripViewGroupOf,
} from '@embedpdf/core-ui';
import { CommandsToken } from '@embedpdf/plugin-commands/contract/host';
import { resolvedCommandsEqual } from '@embedpdf/plugin-commands/contract';
import type { ResolvedCommand } from '@embedpdf/plugin-commands/contract';
import { useCapability } from '../runtime/capabilities';
import { useDocumentId, useKernelValue } from '../runtime/kernel';

/** A group of a strip: its visible commands, in bar order. Groups are separator boundaries. */
export type StripViewGroup = StripViewGroupOf<ResolvedCommand>;

/** A strip, resolved: only visible commands, only groups with one; `execute` runs one for this subtree's document. */
export type StripView = StripViewOf<ResolvedCommand>;

const sameGroups = (left: readonly StripViewGroup[], right: readonly StripViewGroup[]): boolean =>
  sameStripGroups(left, right, resolvedCommandsEqual);

const NO_GROUPS: readonly StripViewGroup[] = Object.freeze([]);

/**
 * The strip a bar shows now, as a ref: the schema says what could appear, each
 * command's `visible` decides what does. `null` while nothing applies, so
 * `v-if="strip"` is all the show-and-hide logic a strip needs. The ref changes
 * only when a command in it changes. Pass a getter for a bar that changes.
 */
export function useStripView(
  bar: MaybeRefOrGetter<BarSchema | undefined>,
): Readonly<Ref<StripView | null>> {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const normalized = computed(() => {
    const schema = toValue(bar);
    return schema ? normalizeBar(schema) : null;
  });
  const groups = useKernelValue(
    () =>
      normalized.value
        ? stripGroupsOf(normalized.value, (id) =>
            commands.resolveCommand(id, documentId.value ?? undefined),
          )
        : NO_GROUPS,
    sameGroups,
  );
  return computed(() =>
    groups.value.length === 0
      ? null
      : {
          groups: groups.value,
          execute: (id: string) =>
            void commands.execute(id, { documentId: documentId.value ?? undefined }),
        },
  );
}
