<script lang="ts">
  import { Menu, MenuItem } from '@embedpdf/viewer-svelte';
  import { copyLink, emailLink } from './share'; // your app
</script>

<Menu icon="link" label="Share">
  <MenuItem icon="copy" onselect={copyLink}>Copy link</MenuItem>
  <MenuItem icon="message" onselect={emailLink}>Email a link</MenuItem>
</Menu>
