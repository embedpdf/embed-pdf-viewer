<script lang="ts">
  import { isPluginError } from '@embedpdf/svelte/runtime';
  import { toFieldRef, useForm } from '@embedpdf/svelte/form';

  const form = useForm();

  async function setTotal() {
    try {
      await form.setValue(toFieldRef('total'), { value: '120.00' });
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        console.log(error.permission); // what was missing, such as 'doc.forms.fill'
      }
    }
  }
</script>

<button onclick={setTotal}>Set the total</button>
