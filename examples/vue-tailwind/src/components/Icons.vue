<script setup lang="ts">
// Base icon props
defineProps<{
  className?: string;
  title?: string;
}>();
</script>

<script lang="ts">
import { defineComponent, h } from 'vue';

const createIcon = (
  paths: string | (string | Record<string, any>)[],
  viewBox = '0 0 24 24',
  extraAttrs = {},
) => {
  return defineComponent({
    props: {
      className: String,
      title: String,
    },
    setup(props) {
      return () => {
        const pathElements = Array.isArray(paths)
          ? paths.map((pathDef, i) => {
              if (typeof pathDef === 'object' && 'd' in pathDef) {
                // Handle objects with stroke/fill/d properties
                const { d, stroke, fill, ...rest } = pathDef;
                return h('path', {
                  key: i,
                  d,
                  stroke: stroke || 'currentColor',
                  fill: fill || 'none',
                  'stroke-linecap': 'round',
                  'stroke-linejoin': 'round',
                  'stroke-width': 2,
                  ...rest,
                });
              }
              // Handle string paths
              return h('path', {
                key: i,
                ...extraAttrs,
                d: pathDef,
                stroke: (extraAttrs as any).stroke || 'currentColor',
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round',
                'stroke-width': 2,
              });
            })
          : h('path', {
              ...extraAttrs,
              d: paths,
              stroke: (extraAttrs as any).stroke || 'currentColor',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': 2,
            });

        return h(
          'svg',
          {
            class: props.className,
            fill: 'none',
            stroke: 'currentColor',
            viewBox,
            'aria-hidden': !props.title,
            role: props.title ? 'img' : 'presentation',
          },
          [props.title ? h('title', props.title) : null, pathElements],
        );
      };
    },
  });
};

export const DocumentIcon = createIcon(
  'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
);
export const CloseIcon = createIcon('M6 18L18 6M6 6l12 12');
export const PlusIcon = createIcon('M12 4v16m8-8H4');
export const SearchMinusIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
  'M9 12l6 0',
]);
export const SearchPlusIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0',
  'M9 12h6',
  'M12 9v6',
]);
export const ChevronDownIcon = createIcon('M19 9l-7 7-7-7');
export const FitPageIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M12 20h-6a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h6',
  'M18 14v7',
  'M18 3v7',
  'M15 18l3 3l3 -3',
  'M15 6l3 -3l3 3',
]);
export const FitWidthIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M4 12v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6',
  'M10 18h-7',
  'M21 18h-7',
  'M6 15l-3 3l3 3',
  'M18 15l3 3l-3 3',
]);
export const MarqueeIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M15 13v4',
  'M13 15h4',
  'M15 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0',
  'M22 22l-3 -3',
  'M6 18h-1a2 2 0 0 1 -2 -2v-1',
  'M3 11v-1',
  'M3 6v-1a2 2 0 0 1 2 -2h1',
  'M10 3h1',
  'M15 3h1a2 2 0 0 1 2 2v1',
]);
export const SinglePageIcon = createIcon(
  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
);
export const BookOpenIcon = createIcon(
  'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
);
export const PrintIcon = createIcon(
  'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
);
export const DownloadIcon = createIcon(
  'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
);
export const FullscreenIcon = createIcon([
  'M4 8v-2a2 2 0 0 1 2 -2h2',
  'M4 16v2a2 2 0 0 0 2 2h2',
  'M16 4h2a2 2 0 0 1 2 2v2',
  'M16 20h2a2 2 0 0 0 2 -2v-2',
]);
export const FullscreenExitIcon = createIcon([
  'M4 8v-2c0 -.551 .223 -1.05 .584 -1.412',
  'M4 16v2a2 2 0 0 0 2 2h2',
  'M16 4h2a2 2 0 0 1 2 2v2',
  'M16 20h2c.545 0 1.04 -.218 1.4 -.572',
  'M3 3l18 18',
]);
export const MenuIcon = createIcon(['M4 8l16 0', 'M4 16l16 0']);
export const MenuDotsIcon = createIcon(
  'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z',
);
export const AlertIcon = createIcon(
  'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
);
export const RefreshIcon = createIcon(
  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
);
export const CheckIcon = createIcon('M5 13l4 4L19 7');
export const SearchIcon = createIcon('M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z');
export const ThumbnailsIcon = createIcon(
  'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
);
export const ChevronLeftIcon = createIcon('M15 19l-7-7 7-7');
export const ChevronRightIcon = createIcon('M9 5l7 7-7 7');
export const TrashIcon = createIcon([
  'M4 7l16 0',
  'M10 11l0 6',
  'M14 11l0 6',
  'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12',
  'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
]);
export const UndoIcon = createIcon(['M9 14l-4 -4l4 -4', 'M5 10h11a4 4 0 1 1 0 8h-1']);
export const RedoIcon = createIcon(['M15 14l4 -4l-4 -4', 'M19 10h-11a4 4 0 1 0 0 8h1']);
export const SquaresIcon = createIcon([
  'M8 10a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-9a2 2 0 0 1 -2 -2z',
  'M16 8v-3a2 2 0 0 0 -2 -2h-9a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h3',
]);

// Special icons with custom attributes
export const RotateRightIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5',
]);
export const RotateLeftIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M19.95 11a8 8 0 1 0 -.5 4m.5 5v-5h-5',
]);
export const SettingsIcon = createIcon([
  'M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  'M12 10.5v1.5',
  'M12 16v1.5',
  'M15.031 12.25l-1.299 .75',
  'M10.268 15l-1.3 .75',
  'M15 15.803l-1.285 -.773',
  'M10.285 12.97l-1.285 -.773',
  'M14 3v4a1 1 0 0 0 1 1h4',
  'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
]);
export const ScreenshotIcon = createIcon(
  [
    { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
    'M7 19a2 2 0 0 1 -2 -2',
    'M5 13v-2',
    'M5 7a2 2 0 0 1 2 -2',
    'M11 5h2',
    'M17 5a2 2 0 0 1 2 2',
    'M19 11v2',
    'M19 17v4',
    'M21 19h-4',
    'M13 19h-2',
  ],
  '0 0 24 24',
);
export const HandIcon = createIcon(
  [
    { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
    'M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5',
    'M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5',
    'M14 5.5a1.5 1.5 0 0 1 3 0v6.5',
    'M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7a69.74 69.74 0 0 1 -.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47',
  ],
  '0 0 24 24',
);

// Annotation icons
export const TextIcon = createIcon([
  'M6.5 15.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0',
  'M14 19v-10.5a3.5 3.5 0 0 1 7 0v10.5',
  'M14 13h7',
  'M10 12v7',
]);
export const CircleIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          stroke: 'currentColor',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
        },
        [
          props.title ? h('title', props.title) : null,
          h('circle', {
            cx: 12,
            cy: 12,
            r: 9,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        ],
      );
  },
});
export const SquareIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          stroke: 'currentColor',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
        },
        [
          props.title ? h('title', props.title) : null,
          h('rect', {
            x: 4,
            y: 4,
            width: 16,
            height: 16,
            rx: 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        ],
      );
  },
});
export const ArrowIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M20 4l-16 16',
  'M16 3h5v5',
]);
export const LineIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M20 4l-16 16',
]);
export const PolygonIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M13.163 2.168l8.021 5.828c.694 .504 .984 1.397 .719 2.212l-3.064 9.43a1.978 1.978 0 0 1 -1.881 1.367h-9.916a1.978 1.978 0 0 1 -1.881 -1.367l-3.064 -9.43a1.978 1.978 0 0 1 .719 -2.212l8.021 -5.828a1.978 1.978 0 0 1 2.326 0z',
]);
export const ItalicIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M11 5l6 0',
  'M7 19l6 0',
  'M14 5l-4 14',
]);

// Complex multi-colored icons
export const HighlightIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        [
          props.title ? h('title', props.title) : null,
          h('path', { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' }),
          h('rect', {
            x: 2,
            y: 6,
            width: 20,
            height: 16,
            rx: 2,
            fill: 'currentColor',
            stroke: 'none',
          }),
          h('path', { d: 'M8 16v-8a4 4 0 1 1 8 0v8', stroke: '#000000' }),
          h('path', { d: 'M8 10h8', stroke: '#000000' }),
        ],
      );
  },
});

export const PenIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        },
        [
          props.title ? h('title', props.title) : null,
          h('g', { transform: 'rotate(47.565 12.1875 10.75)' }, [
            h('path', {
              stroke: '#000000',
              d: 'm14.18752,16.75l0,-12c0,-1.1 -0.9,-2 -2,-2s-2,0.9 -2,2l0,12l2,2l2,-2z',
            }),
            h('path', { stroke: '#000000', d: 'm10.18752,6.75l4,0' }),
          ]),
          h('path', {
            stroke: 'currentColor',
            d: 'm19.37499,20.125c0.56874,0.0625 -4.04999,-0.5625 -6.41249,-0.4375c-2.3625,0.125 -4.75833,1.22916 -6.85624,1.625c-1.76458,0.6875 -3.40416,-0.9375 -1.98125,-2.49999',
          }),
        ],
      );
  },
});

export const SquigglyIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  { d: 'M8 16v-8a4 4 0 1 1 8 0v8', stroke: '#000000' },
  { d: 'M8 10h8', stroke: '#000000' },
  'M4 20c1.5 -1.5 3.5 -1.5 5 0s3.5 1.5 5 0 3.5 -1.5 5 0',
]);
export const StrikethroughIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  { d: 'M8 16v-8a4 4 0 1 1 8 0v8', stroke: '#000000' },
  'M4 10h16',
]);
export const UnderlineIcon = createIcon([
  { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' },
  'M4 20h16',
  { d: 'M8 16v-8a4 4 0 1 1 8 0v8', stroke: '#000000' },
  { d: 'M8 10h8', stroke: '#000000' },
]);
export const ZigzagIcon = createIcon('M12 2.4L21.36 11.76L2.64 12.24L12 21.6');
export const PolylineIcon = ZigzagIcon;

// Redaction icons with diagonal stripe patterns (from snippet project)
export const RedactTextIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          stroke: 'currentColor',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': !props.title,
          role: props.title ? 'img' : 'presentation',
        },
        [
          props.title ? h('title', props.title) : null,
          h('defs', [
            h('clipPath', { id: 'stripeClip' }, [
              h('rect', { x: '2', y: '12', width: '20', height: '10', rx: '2' }),
            ]),
          ]),
          h('path', { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' }),
          h('path', { d: 'M7 4h10' }),
          h('path', { d: 'M12 4v8' }),
          h('rect', { x: '2', y: '12', width: '20', height: '10', rx: '2', fill: 'none' }),
          h('g', { 'clip-path': 'url(#stripeClip)' }, [
            h('path', { d: 'M-7 24l12 -12' }),
            h('path', { d: 'M-3 24l12 -12' }),
            h('path', { d: 'M1 24l12 -12' }),
            h('path', { d: 'M5 24l12 -12' }),
            h('path', { d: 'M9 24l12 -12' }),
            h('path', { d: 'M13 24l12 -12' }),
            h('path', { d: 'M17 24l12 -12' }),
            h('path', { d: 'M21 24l12 -12' }),
            h('path', { d: 'M25 24l12 -12' }),
          ]),
        ],
      );
  },
});

export const RedactAreaIcon = defineComponent({
  props: { className: String, title: String },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          class: props.className,
          fill: 'none',
          stroke: 'currentColor',
          viewBox: '0 0 24 24',
          'stroke-width': 2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': !props.title,
          role: props.title ? 'img' : 'presentation',
        },
        [
          props.title ? h('title', props.title) : null,
          h('defs', [
            h('clipPath', { id: 'redactClip' }, [
              h('rect', { x: '10', y: '10', width: '12', height: '12', rx: '2' }),
            ]),
          ]),
          h('path', { stroke: 'none', d: 'M0 0h24v24H0z', fill: 'none' }),
          h('path', { d: 'M6 20h-1a2 2 0 0 1 -2 -2v-1' }),
          h('path', { d: 'M3 13v-3' }),
          h('path', { d: 'M3 6v-1a2 2 0 0 1 2 -2h1' }),
          h('path', { d: 'M10 3h3' }),
          h('path', { d: 'M17 3h1a2 2 0 0 1 2 2v1' }),
          h('rect', { x: '10', y: '10', width: '12', height: '12', rx: '2', fill: 'none' }),
          h('g', { 'clip-path': 'url(#redactClip)' }, [
            h('path', { d: 'M-2 24l14 -14' }),
            h('path', { d: 'M2 24l14 -14' }),
            h('path', { d: 'M6 24l14 -14' }),
            h('path', { d: 'M10 24l15 -15' }),
            h('path', { d: 'M14 24l15 -15' }),
            h('path', { d: 'M18 24l15 -15' }),
          ]),
        ],
      );
  },
});
</script>
