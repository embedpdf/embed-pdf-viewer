<!-- The publish check's toolbar: a plugin's API handle and its state, read the documented way. -->
<script lang="ts">
  import { useSearch, useSearchState } from '@embedpdf/svelte/search';
  import { useForm, useFormState } from '@embedpdf/svelte/form';

  const search = useSearch();
  const searchState = useSearchState();
  const form = useForm();
  const formState = useFormState();
  let text = $state('PDF');

  $effect(() => {
    void search.search({ text });
  });

  const hits: number = $derived(searchState.hitCount);
  const count = $derived(
    searchState.status === 'searching'
      ? 'Searching…'
      : `${searchState.activeHitIndex + 1} of ${hits}`,
  );

  export async function addField(
    page: NonNullable<Parameters<typeof form.create>[0]['widgets']>[number]['page'],
  ) {
    await form.create({
      family: 'text',
      name: 'name',
      widgets: [{ page, rect: { x: 72, y: 540, width: 240, height: 24 } }],
    });
  }
</script>

<div class="toolbar">
  <input bind:value={text} type="search" aria-label="Search" />
  <output>{count} · {formState.fields.length} fields</output>
  <button type="button" disabled={hits === 0} onclick={() => search.nextHit()}>↓</button>
</div>
