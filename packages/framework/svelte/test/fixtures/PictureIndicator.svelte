<!-- A layer that shows its page's picture state through `usePictureState()`: `loading slow`, `ready`. -->
<script lang="ts">
  import { usePictureState } from '../../src/render';

  const picture = usePictureState();
</script>

<span data-testid="picture">{picture.current.status}{picture.current.slow ? ' slow' : ''}</span>
