<!-- The annotation layer and the form layer of one page, each inside an element that names it. -->
<script lang="ts">
  import { AnnotationLayer } from '../../src/annotation';
  import { FormLayer } from '../../src/form';
</script>

<div data-layer="annotation">
  <AnnotationLayer />
</div>
<div data-layer="form">
  <FormLayer />
</div>
