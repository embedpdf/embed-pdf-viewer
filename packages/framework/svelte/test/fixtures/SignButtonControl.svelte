<!-- A signature field drawn as a button of the app's own: something that takes the cursor. -->
<script lang="ts">
  import type { FieldControlProps } from '../../src/form';

  let { widget }: FieldControlProps = $props();
</script>

<button aria-label="Sign {widget.label}" style="width: 100%"></button>
