<!-- Your own component: the document's status, with two controls of its own. -->
<script lang="ts">
  let { status }: { status: string } = $props();
</script>

<span class="status">
  {status} <button data-check="approve">Approve</button>
  <button data-check="reject">Reject</button>
</span>
