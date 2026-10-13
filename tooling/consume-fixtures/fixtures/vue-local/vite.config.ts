import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// The viewer asks for no bundler setup: Vue's own plugin and nothing else.
export default defineConfig({ plugins: [vue()] });
