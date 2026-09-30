import { stagePlugin } from '@embedpdf/vue/stage';

stagePlugin({
  padding: 24,
  spread: 'odd',
  responsive: [
    { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4 } },
    { when: { orientation: 'portrait' }, settings: { spread: 'none' } },
  ],
});
