<script lang="ts">
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { archive, engine, plugins, report } from './pdf';
</script>

<Viewer
  {engine}
  {plugins}
  identity={{ userId: 'u_381', displayName: 'Dana Smith' }}
  scope={[
    'doc.open',
    'doc.render',
    'doc.text.select',
    'doc.annotate.read',
    'annotations:create:self',
    'annotations:update:self',
    'annotations:delete:self',
  ]}
  initialDocuments={[
    { source: report },
    { source: archive, scope: ['doc.open', 'doc.render'] }, // this one is read-only
  ]}
/>
