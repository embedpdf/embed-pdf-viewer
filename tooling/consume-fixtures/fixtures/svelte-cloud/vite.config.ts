import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The viewer asks for no bundler setup: Svelte's own plugin and nothing else.
export default defineConfig({ plugins: [svelte()] });
