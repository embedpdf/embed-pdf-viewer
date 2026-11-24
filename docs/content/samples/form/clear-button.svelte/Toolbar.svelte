<script lang="ts">
  import { useForm } from '@embedpdf/svelte/form';
  import { useStage } from '@embedpdf/svelte/stage';

  const form = useForm();
  const stage = useStage();

  const fillIn = () =>
    form.importValues({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Lanternfield',
    });
</script>

<div class="toolbar">
  <button type="button" class="button" onclick={fillIn}>Fill in</button>
  <button type="button" class="button" onclick={() => stage.zoomIn()}>Zoom in</button>
  <button type="button" class="button" onclick={() => stage.rotateViewBy(90)}>Turn the view</button>
</div>
