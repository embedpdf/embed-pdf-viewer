<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDocumentsEvent } from '@embedpdf/vue/runtime';

const router = useRouter();

useDocumentsEvent(
  (documents) => documents.onActiveChanged,
  ({ documentId }) => router.replace(`/documents/${documentId}`),
);
</script>
