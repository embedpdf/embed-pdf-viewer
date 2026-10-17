<!--
  Binds everything inside to a stage lens: the stage readers and stage chrome inside use `token`
  unless they are given one themselves.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setStageToken, type StageTokenProp } from './stage-scope';

  let { token, children }: { token: StageTokenProp; children?: Snippet } = $props();

  setStageToken(() => token);
</script>

{@render children?.()}
