<!-- A properties form: the inputs start with what the file says, and Save writes them back. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { DocumentMetadata } from '@embedpdf/svelte/runtime';
  import { useMetadata, useMetadataEvent, useMetadataState } from '@embedpdf/svelte/metadata';

  const EDITABLE = ['title', 'author', 'subject', 'keywords'] as const;
  type Draft = Record<(typeof EDITABLE)[number], string>;

  let { initial }: { initial: DocumentMetadata } = $props();

  const metadata = useMetadata();
  const modifiedAt = useMetadataState((fields) => fields.metadata?.modifiedAt ?? null);
  // What the file said when the form opened; the inputs edit it from there.
  const draft = $state<Draft>(
    untrack(() => ({
      title: initial.title ?? '',
      author: initial.author ?? '',
      subject: initial.subject ?? '',
      keywords: initial.keywords ?? '',
    })),
  );
  let changes = $state<string[]>([]);

  // Every change to the standard fields, by you or anyone else.
  useMetadataEvent(
    (capability) => capability.onUpdated,
    ({ changedKeys, origin }) => {
      changes = [
        `${changedKeys.join(', ')} changed ${origin.kind === 'local' ? 'here' : 'elsewhere'}`,
        ...changes,
      ];
    },
  );

  const canUpdate = $derived(metadata.canUpdate());
  // An empty field removes it: null, not ''.
  const save = () =>
    metadata.update({
      title: draft.title.trim() || null,
      author: draft.author.trim() || null,
      subject: draft.subject.trim() || null,
      keywords: draft.keywords.trim() || null,
    });
</script>

<div class="layout">
  <form
    class="form"
    onsubmit={(event) => {
      event.preventDefault();
      void save();
    }}
  >
    {#each EDITABLE as key (key)}
      <label class="row">
        <span class="name">{key}</span>
        <input class="field" bind:value={draft[key]} disabled={!canUpdate} placeholder="not set" />
      </label>
    {/each}
    <div class="actions">
      <button type="submit" class="button primary" disabled={!canUpdate}>Save</button>
      <button
        type="button"
        class="button"
        disabled={!canUpdate}
        onclick={() => metadata.update({ modifiedAt: new Date() })}
      >
        Set the modified date to now
      </button>
    </div>
  </form>
  <section class="changes" aria-live="polite">
    <h3 class="changes-title">Changes</h3>
    <p class="modified">
      Last changed: {modifiedAt.current ? new Date(modifiedAt.current).toLocaleString() : 'not set'}
    </p>
    {#if changes.length === 0}
      <p class="empty">Edit a field and save.</p>
    {:else}
      <ul class="log">
        {#each changes as change, index (changes.length - index)}
          <li>{change}</li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
