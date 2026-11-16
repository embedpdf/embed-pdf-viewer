<script lang="ts">
  import { commandsPlugin } from '@embedpdf/svelte/commands';
  import { historyCommands } from '@embedpdf/svelte/history';
  import { Viewer, documentCommands } from '@embedpdf/svelte/runtime';
  import { stageCommands } from '@embedpdf/svelte/stage';
  import { engine } from './pdf';

  const plugins = [
    /* … */
    // Zoom, pages and rotation, undo and redo, download and print: no tools, no copy.
    commandsPlugin({ commands: [...stageCommands, ...historyCommands, ...documentCommands] }),
  ];
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar and pages -->
</Viewer>
