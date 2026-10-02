<!-- A layer that reads the page it's on through `usePage()`. -->
<script lang="ts">
  import { usePage } from '../../src/runtime';

  const page = usePage();
</script>

<span class="layer" data-page={page.ref.objectNumber} data-scale={page.transform.viewScale}></span>
