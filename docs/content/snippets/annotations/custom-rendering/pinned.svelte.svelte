<!-- ApprovalStatus.svelte -->
<script lang="ts">
  import { Anchored } from '@embedpdf/svelte/anchored';
  import { annotationKey, useAnnotationAnchor, type Annotation } from '@embedpdf/svelte/annotation';
  import { useApproval } from './approvals'; // your own data

  let { stamp }: { stamp: Annotation } = $props();

  // Pinned under the stamp: it stays there while the stamp moves, and scrolls away with it.
  const anchor = useAnnotationAnchor(() => stamp.ref);
  const approval = useApproval(() => annotationKey(stamp.ref));
</script>

<Anchored anchor={anchor.current} placement="bottom" pinned>
  <div class="status">
    {approval.signedOff ? 'Signed off' : 'Waiting'}
    <button onclick={approval.toggle}>{approval.signedOff ? 'Undo' : 'Sign off'}</button>
  </div>
</Anchored>
