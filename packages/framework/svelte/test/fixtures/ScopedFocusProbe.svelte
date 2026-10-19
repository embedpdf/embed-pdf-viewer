<!-- A field in each of two documents' scopes: `notes` in `a`, `search` in `b`. -->
<script lang="ts">
  import { DocumentScope } from '../../src/runtime';
  import { surfaceFocus } from '../../src/shell';
</script>

<DocumentScope id="a">
  <input data-field="a-notes" {@attach surfaceFocus('notes')} />
</DocumentScope>
<DocumentScope id="b">
  <input data-field="b-search" {@attach surfaceFocus('search')} />
</DocumentScope>
