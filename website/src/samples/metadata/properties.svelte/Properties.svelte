<!-- The document's properties, the way a "Document properties" dialog shows them. -->
<script lang="ts">
  import { useMetadataState } from '@embedpdf/svelte/metadata';

  const FIELDS = [
    ['title', 'Title'],
    ['author', 'Author'],
    ['subject', 'Subject'],
    ['keywords', 'Keywords'],
    ['creator', 'Made in'],
    ['producer', 'Turned into a PDF by'],
    ['createdAt', 'Created'],
    ['modifiedAt', 'Last changed'],
    ['trapped', 'Trapped'],
  ] as const;

  // Dates are ISO strings: show them in the reader's own format.
  const DATES: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt']);
  const show = (field: string, value: string | null) => {
    if (value === null) return null;
    return DATES.has(field) ? new Date(value).toLocaleString() : value;
  };

  const properties = useMetadataState();
</script>

<section class="panel">
  <header class="panel-header">
    <h3 class="panel-title">Document properties</h3>
    <span class="status" data-status={properties.status}>
      {properties.status}
    </span>
  </header>
  <dl class="properties">
    {#each FIELDS as [field, label] (field)}
      {@const value = properties.metadata ? show(field, properties.metadata[field]) : null}
      <div class="property">
        <dt>{label}</dt>
        <dd class={value === null ? 'unset' : undefined}>{value ?? 'not set'}</dd>
      </div>
    {/each}
  </dl>
</section>
