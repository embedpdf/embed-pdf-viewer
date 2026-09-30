<script lang="ts">
  import { useSurface } from '@embedpdf/svelte/shell';
  import CommentList from './CommentList.svelte';

  const panel = useSurface('comments'); // panel.props is { focus: … }
</script>

<CommentList focus={panel.props.focus} />
