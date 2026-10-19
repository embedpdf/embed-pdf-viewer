<!--
  A capability handle in reactions: a read (`getCount()`) in one effect, a verb (`touch()`) in
  another that runs once the document is ready.
-->
<script lang="ts">
  import { useCapability, useDocument } from '../../src/runtime';
  import { CounterToken } from './counter-plugin';

  let { counts, verbRuns }: { counts: unknown[]; verbRuns: unknown[] } = $props();

  const counter = useCapability(CounterToken);
  const document = useDocument();

  $effect(() => {
    try {
      counts.push(counter.getCount());
    } catch {
      counts.push('not-ready');
    }
  });

  $effect(() => {
    if (document.status !== 'ready') return;
    verbRuns.push(document.id);
    counter.touch();
  });
</script>

<p data-testid="count">{document.status === 'ready' ? counter.getCount() : 'none'}</p>
