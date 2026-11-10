<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-vue';

const registration = { grant: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

const config: ViewerConfig = {
  plugins: {
    stamp: {
      libraries: [{ id: 'marks', url: 'https://www.cloudpdf.com/pdfs/marks.pdf' }],
    },
  },
  icons: {
    tick: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 12.5l2.5 2.5 5-5'],
  },
  commands: [
    {
      id: 'lanternfield:tick',
      label: 'Tick a box',
      icon: 'tick',
      run: ({ get }) => get('stamp').armAsset('marks:Check'),
      active: ({ get }) => get('stamp').getArmedAsset()?.id === 'marks:Check',
    },
  ],
  layout: (layout) => layout.add('lanternfield:tick', { to: 'insert', after: 'tool:stamp' }),
};
</script>

<template>
  <PDFViewer :src="registration" v-bind="config" style="height: 100%" />
</template>
