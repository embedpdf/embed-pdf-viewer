<!-- `useCommand()` with its id as a function over a prop: records the label on every change. -->
<script lang="ts">
  import { useCommand } from '../../src/commands';

  let { id, seen }: { id: string; seen: (string | null)[] } = $props();

  const command = useCommand(() => id);

  $effect(() => {
    seen.push(command.current?.label ?? null);
  });
</script>
