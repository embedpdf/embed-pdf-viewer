<template>
  <div
    class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-8"
  >
    <div class="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
      <h1 class="mb-6 text-4xl font-bold text-gray-900">EmbedPDF Vue + Tailwind</h1>

      <div class="mb-8 space-y-4 text-gray-600">
        <p class="text-lg">
          Welcome to the EmbedPDF example for Vue 3 and Tailwind CSS. This demonstrates how to
          integrate a powerful PDF viewer into your Vue applications with a beautiful, modern UI.
        </p>

        <div class="rounded-lg bg-blue-50 p-4">
          <h2 class="mb-2 font-semibold text-blue-900">Features:</h2>
          <ul class="list-inside list-disc space-y-2 text-sm">
            <li>High-performance PDF rendering with PDFium</li>
            <li>Multiple document support with tabs</li>
            <li>Zoom, pan, and page navigation</li>
            <li>Responsive design with Tailwind CSS</li>
            <li>Modern Vue 3 Composition API</li>
          </ul>
        </div>
      </div>

      <div class="space-y-4">
        <a
          href="#/viewer"
          class="block rounded-lg bg-indigo-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Go to PDF Viewer (with ViewManager)
        </a>

        <a
          href="#/viewer-simple"
          class="block rounded-lg bg-purple-600 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-purple-700"
        >
          Go to Simple PDF Viewer (DocumentManager only)
        </a>

        <a
          href="#/about"
          class="block rounded-lg border-2 border-gray-300 px-6 py-3 text-center font-semibold text-gray-700 transition-colors hover:border-indigo-600 hover:text-indigo-600"
        >
          Learn More
        </a>
      </div>

      <div class="mt-8 rounded-lg bg-indigo-50 p-4">
        <p class="text-sm text-indigo-900">
          <strong>Getting Started:</strong> Choose a viewer to open and load your PDF documents. The
          ViewManager version supports split views, while the simple version uses tabs.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// This is a static page, no logic needed
</script>
