<!--
  Probes, and one more inside a `<StageScope>`: it reads the scoped lens's rotation, or with
  `tokens`, the lens it binds to.
-->
<script lang="ts">
  import { StageScope, type StageTokenProp } from '../../src/stage';
  import { useStageState, useStageToken } from '../../src/stage';
  import Probe from './Probe.svelte';
  import Probes from './Probes.svelte';

  let {
    probes,
    token,
    scoped,
    tokens = false,
  }: {
    probes: { read: () => unknown; pick: (result: unknown) => unknown; seen: unknown[] }[];
    token: StageTokenProp;
    scoped: unknown[];
    tokens?: boolean;
  } = $props();
</script>

<Probes {probes} />
<StageScope {token}>
  <Probe
    read={() => (tokens ? useStageToken() : useStageState((state) => state.viewRotation))}
    pick={(value) => value.current}
    seen={scoped}
  />
</StageScope>
