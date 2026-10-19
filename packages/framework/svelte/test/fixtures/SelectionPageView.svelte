<!-- A page view with the selection highlight and a selection menu anchored to it. -->
<script lang="ts">
  import { PageView } from '../../src/page-view';
  import { SelectionLayer, SelectionMenu } from '../../src/selection';
</script>

<PageView page={0} width={600}>
  <SelectionLayer />
  <SelectionMenu>
    <button class="menu">Copy</button>
  </SelectionMenu>
</PageView>
