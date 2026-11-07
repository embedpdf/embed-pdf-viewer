<script lang="ts">
  import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-svelte';

  const CHECKS = ['Parties', 'Dates', 'Payment', 'Signatures'];

  interface Review {
    done: string[];
    status: 'review' | 'approved';
    approve(): void;
  }

  // The commands read your state from `appState`, so nothing goes stale.
  const config: ViewerConfig<Review> = {
    commands: [
      {
        id: 'acme:approve',
        label: 'Approve',
        icon: 'check',
        enabled: ({ appState }) => appState.done.length === CHECKS.length,
        active: ({ appState }) => appState.status === 'approved',
        run: ({ appState }) => appState.approve(),
      },
    ],
    layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
  };

  let done = $state<string[]>([]);
  let status = $state<Review['status']>('review');
</script>

<fieldset>
  {#each CHECKS as check (check)}
    <label><input type="checkbox" value={check} bind:group={done} /> {check}</label>
  {/each}
</fieldset>
<PDFViewer
  src="https://www.embedpdf.com/pdfs/welcome.pdf"
  {...config}
  appState={{ done, status, approve: () => (status = 'approved') }}
  style="height: 100vh"
/>
