<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { SearchLayer, searchPlugin } from '@embedpdf/svelte/search';
  import { SelectionLayer, selectionPlugin } from '@embedpdf/svelte/selection';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { cloudEngine } from '@cloudpdf/engine';
  import Controls from './Controls.svelte';
  import ReopenOnRoleChange from './ReopenOnRoleChange.svelte';

  import '../checks.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    selectionPlugin(),
    searchPlugin(),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

  // What each role may do, as permissions.
  const roles = {
    viewer: ['doc.open', 'doc.render', 'doc.text.select'],
    reviewer: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.copy', 'doc.text.search'],
    owner: [
      'doc.open',
      'doc.render',
      'doc.text.select',
      'doc.text.copy',
      'doc.text.search',
      'doc.download',
    ],
  };
  type Role = keyof typeof roles;
</script>

<script lang="ts">
  let role = $state<Role>('reviewer');
</script>

<Viewer
  {engine}
  {plugins}
  scope={roles[role]}
  initialDocuments={[{ source: ebook, name: 'ebook.pdf' }]}
>
  <div class="toolbar">
    <label class="label">
      Role
      <select class="select" bind:value={role}>
        <option value="viewer">viewer: read and select</option>
        <option value="reviewer">reviewer: also search and copy</option>
        <option value="owner">owner: also download</option>
      </select>
    </label>
  </div>
  <ReopenOnRoleChange {role} {ebook} />
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Opening…</p>
    {/snippet}
    <Controls />
    <Stage class="stage">
      <RenderLayer />
      <SearchLayer />
      <SelectionLayer />
    </Stage>
  </DocumentGate>
</Viewer>
