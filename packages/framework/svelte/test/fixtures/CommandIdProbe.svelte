<!-- `useCommand()` with its id as a function over a prop: records, on every change, what a
     button for it shows (its label while it's visible, else nothing). -->
<script lang="ts">
  import { useCommand } from '../../src/commands';

  let { id, seen }: { id: string; seen: (string | null)[] } = $props();

  const command = useCommand(() => id);

  $effect(() => {
    seen.push(command.current.visible ? command.current.label : null);
  });
</script>
