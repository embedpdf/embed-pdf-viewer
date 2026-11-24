<script lang="ts">
  import { FormLayer, type FieldControl } from '@embedpdf/svelte/form';
  import FieldSwitch from './FieldSwitch.svelte';

  const controls: FieldControl[] = [
    {
      for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox',
      component: FieldSwitch,
    },
  ];
</script>

<FormLayer {controls} />
