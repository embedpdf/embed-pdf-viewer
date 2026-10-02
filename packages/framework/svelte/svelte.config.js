// How the package's components compile, for `svelte-package`, `svelte-check` and the tests:
// TypeScript in `<script lang="ts">` goes through Vite's preprocessor.
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
