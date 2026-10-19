<!-- pages/contract.vue -->
<template>
  <ClientOnly>
    <DocumentViewer />
    <template #fallback>
      <div style="height: 600px">Loading the viewer…</div>
    </template>
  </ClientOnly>
</template>
