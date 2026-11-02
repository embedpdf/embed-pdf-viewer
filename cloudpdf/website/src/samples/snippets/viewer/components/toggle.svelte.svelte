<script lang="ts">
  import { Button, Icon } from '@cloudpdf/viewer-svelte';
  import { review } from './review.svelte'; // your app
</script>

<span class="review">
  <Button icon="message" label="Notes" active={review.notesShown} onclick={review.toggleNotes} />
  {#if review.saved}
    <span class="saved"><Icon name="check" size={16} /> Saved</span>
  {/if}
</span>
