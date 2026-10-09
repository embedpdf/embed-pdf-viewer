<script setup lang="ts">
import { useSearchEvent } from '@embedpdf/vue/search';
import { announce } from './announce';

useSearchEvent(
  (search) => search.onCompleted,
  ({ hitCount }) => announce(`${hitCount} matches`),
);
</script>
