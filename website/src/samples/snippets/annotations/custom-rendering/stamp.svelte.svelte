<!--
  ApprovalStamp.svelte, the component of this renderer:
  { for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalStamp,
    interactive: ({ toolId }) => toolId === 'pan' }
-->
<script lang="ts">
  import { annotationKey, type AnnotationRendererProps } from '@embedpdf/svelte/annotation';
  import StatusDot from './StatusDot.svelte';
  import { useApproval } from './approvals'; // your own data

  let { annotation, box, page, native, interactive }: AnnotationRendererProps = $props();
  // A getter, so the approval follows the annotation this renderer shows
  const approval = useApproval(() => annotationKey(annotation.ref));
  const rect = $derived(page.transform.pageToViewRect(box));
</script>

{@render native()}
<div
  style:position="absolute"
  style:left="{rect.x}px"
  style:top="{rect.y}px"
  style:width="{rect.width}px"
  style:height="{rect.height}px"
>
  <StatusDot status={approval.status} />
  {#if interactive}
    <button onclick={approval.open}>Details</button>
  {/if}
</div>
