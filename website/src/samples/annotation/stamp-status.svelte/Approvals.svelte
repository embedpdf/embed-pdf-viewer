<!--
  Every approval stamp's status, mounted in the Stage's overlay. Your own data for each stamp is
  kept by its name.
-->
<script lang="ts">
  import { useAnnotationList, type Annotation } from '@embedpdf/svelte/annotation';
  import ApprovalStatus from './ApprovalStatus.svelte';

  // An approval stamp's name, which the stamp keeps in every PDF app; null for any other annotation.
  const approvalName = (annotation: Annotation): string | null =>
    annotation.subtype === 'stamp' && annotation.name?.startsWith('approval-')
      ? annotation.name
      : null;

  const stamps = useAnnotationList({ subtype: 'stamp' });
  const approvals = $derived(
    stamps.current.flatMap((stamp) => {
      const name = approvalName(stamp);
      return name ? [{ name, stamp }] : [];
    }),
  );
  let signedOff = $state<Record<string, boolean>>({ 'approval-budget': true });
</script>

{#each approvals as { name, stamp } (name)}
  <ApprovalStatus
    {stamp}
    signedOff={signedOff[name] ?? false}
    onToggle={() => (signedOff = { ...signedOff, [name]: !signedOff[name] })}
  />
{/each}
