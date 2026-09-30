<script lang="ts">
  import { useActionsUiAdapter } from '@embedpdf/svelte/actions';
  import { toast } from './toast';

  useActionsUiAdapter({
    openUri: (uri) => {
      if (confirm(`Open ${uri}?`)) window.open(uri, '_blank', 'noopener');
    },
    alert: (message) => toast(message),
  });
</script>

<!-- your viewer -->
