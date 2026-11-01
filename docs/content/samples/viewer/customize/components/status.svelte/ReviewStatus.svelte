<script lang="ts">
  let { status = $bindable() }: { status: string } = $props();
</script>

<label class="status" data-status={status}>
  <span class="dot"></span>
  <select bind:value={status} aria-label="Review status">
    <option value="draft">Draft</option>
    <option value="review">In review</option>
    <option value="approved">Approved</option>
  </select>
</label>
