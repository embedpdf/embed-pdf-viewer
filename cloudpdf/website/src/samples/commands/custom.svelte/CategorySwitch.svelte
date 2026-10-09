<!-- Turning a category off hides its commands wherever they appear. -->
<script lang="ts">
  import { useCommands, useCommandsSettings } from '@embedpdf/svelte/commands';

  let { category, label }: { category: string; label: string } = $props();

  const commands = useCommands();
  const off = useCommandsSettings((settings) => settings.disabledCategories.includes(category));
</script>

<label class="switch">
  <input
    type="checkbox"
    checked={!off.current}
    onchange={(event) =>
      event.currentTarget.checked
        ? commands.enableCategory(category)
        : commands.disableCategory(category)}
  />
  {label}
</label>
