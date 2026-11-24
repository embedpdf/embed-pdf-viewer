<!-- A switch that records the frame it draws into, by its box's label. -->
<script lang="ts">
  import type { FieldControlProps } from '../../src/form';
  import { formControlRecords } from './form-control-records';
  import SwitchControl from './SwitchControl.svelte';

  let props: FieldControlProps = $props();

  $effect(() => {
    formControlRecords.frames.set(props.widget.label, props.frame);
  });
</script>

<SwitchControl {...props} />
