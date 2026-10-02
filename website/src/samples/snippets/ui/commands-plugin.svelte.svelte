<script lang="ts">
  import { AnnotationToken } from '@embedpdf/svelte/annotation';
  import { commandsPlugin, standardCommands } from '@embedpdf/svelte/commands';
  import { DocumentsToken, Viewer } from '@embedpdf/svelte/runtime';
  import { engine } from './pdf';
  import { approveDocument } from './review';

  const plugins = [
    /* … */
    commandsPlugin({
      commands: [
        ...standardCommands,
        {
          id: 'review:approve',
          label: 'Approve',
          icon: 'check',
          shortcut: 'Mod+Enter',
          enabled: ({ get }) => get(AnnotationToken).canCreate(),
          run: ({ get }) => approveDocument(get(DocumentsToken)),
        },
      ],
    }),
  ];
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar and pages -->
</Viewer>
