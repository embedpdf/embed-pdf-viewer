import type { SVGProps } from 'react';

/**
 * The kit's own copies of the handful of glyphs its components render, so a
 * kit component never reaches into a site's icon set. Sites keep their own
 * icon modules for everything else.
 */
type IconProps = SVGProps<SVGSVGElement>;

export function ArrowRight(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function BoltBadgeIcon(props: IconProps) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 2v7h5a1 1 0 0 1 .868 1.497l-.06.091-8 11c-.568.783-1.808.38-1.808-.588v-6h-5a1 1 0 0 1-.868-1.497l.06-.091 8-11A1 1 0 0 1 13 2z" />
    </svg>
  );
}

export function PuzzleBadgeIcon(props: IconProps) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M10 2a3 3 0 0 1 2.995 2.824l.005.176v1h3a2 2 0 0 1 1.995 1.85l.005.15v3h1a3 3 0 0 1 .176 5.995l-.176.005h-1v3a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-1a1 1 0 0 0-1.993-.117l-.007.117v1a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h1a1 1 0 0 0 .117-1.993l-.117-.007h-1a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h3v-1a3 3 0 0 1 3-3z" />
    </svg>
  );
}

export function EngineIcon(props: IconProps) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2.75 19.75 7v10L12 21.25 4.25 17V7L12 2.75Z" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 5.75v3M12 15.25v3M6.75 9l2.6 1.5M14.65 13.5l2.6 1.5M17.25 9l-2.6 1.5M9.35 13.5 6.75 15" />
    </svg>
  );
}

export function ServerBadgeIcon(props: IconProps) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="3" width="20" height="7" rx="2" />
      <rect x="2" y="14" width="20" height="7" rx="2" />
      <path d="M6 6.5h.01M6 17.5h.01" />
    </svg>
  );
}

/* ---- Framework logos: the integration switchers on both sites pick from
   the same vocabulary, so the marks live here. ---- */

export function ReactIcon({ size = 18, color = '#61DAFB', ...props }: IconProps & { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6.306 8.711c-2.602.723-4.306 1.926-4.306 3.289 0 2.21 4.477 4 10 4 .773 0 1.526-.035 2.248-.102" />
      <path d="M17.692 15.289c2.603-.722 4.308-1.926 4.308-3.289 0-2.21-4.477-4-10-4-.773 0-1.526.035-2.25.102" />
      <path d="M6.305 15.287c-.676 2.615-.485 4.693.695 5.373 1.913 1.105 5.703-1.877 8.464-6.66.387-.67.733-1.339 1.036-2" />
      <path d="M17.694 8.716c.677-2.616.487-4.696-.694-5.376-1.913-1.105-5.703 1.877-8.464 6.66-.387.67-.733 1.34-1.037 2" />
      <path d="M12 5.424c-1.925-1.892-3.82-2.766-5-2.084-1.913 1.104-1.226 5.877 1.536 10.66.386.67.793 1.304 1.212 1.896" />
      <path d="M12 18.574c1.926 1.893 3.821 2.768 5 2.086 1.913-1.104 1.226-5.877-1.536-10.66-.375-.65-.78-1.283-1.212-1.897" />
      <path d="M11.5 12.866a1 1 0 1 0 1-1.732 1 1 0 0 0-1 1.732z" />
    </svg>
  );
}

export function VueIcon({ size = 18, color = '#4FC08D', ...props }: IconProps & { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16.5 4l-4.5 8l-4.5 -8" />
      <path d="M3 4l9 16l9 -16" />
    </svg>
  );
}

export function SvelteIcon({ size = 18, color = '#FF3E00', ...props }: IconProps & { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <path d="M20.68 3.17a7.3 7.3 0 0 0-9.8-2.1l-5.6 3.56a6.36 6.36 0 0 0-2.89 4.3 6.66 6.66 0 0 0 .67 4.33 6.14 6.14 0 0 0-.95 2.4 6.84 6.84 0 0 0 1.16 5.16 7.33 7.33 0 0 0 9.8 2.12l5.6-3.56a6.36 6.36 0 0 0 2.88-4.3 6.66 6.66 0 0 0-.67-4.32 6.79 6.79 0 0 0-.2-7.59zM10.32 21.13a4.43 4.43 0 0 1-4.76-1.77c-.65-.9-.89-2.01-.7-3.11l.11-.53.1-.33.3.2c.66.5 1.4.86 2.19 1.1l.2.07-.02.2c-.02.28.06.59.22.83.33.47.9.7 1.45.55.12-.04.24-.08.34-.14l5.58-3.56c.28-.18.46-.45.53-.77.06-.33-.02-.67-.2-.94-.33-.46-.9-.67-1.45-.53-.12.04-.25.09-.35.15l-2.11 1.34a4.43 4.43 0 0 1-5.9-1.28 4.1 4.1 0 0 1-.7-3.11A3.85 3.85 0 0 1 6.92 6.9l5.57-3.56c.35-.22.73-.38 1.14-.5 1.8-.47 3.7.24 4.76 1.76a4.12 4.12 0 0 1 .57 3.64l-.1.33-.29-.2a7.42 7.42 0 0 0-2.2-1.1l-.2-.06.02-.2c.02-.29-.06-.6-.22-.84-.33-.47-.9-.67-1.45-.53-.12.04-.24.08-.34.14L8.59 9.37c-.28.19-.46.45-.52.78-.06.32.02.67.2.93.32.47.9.67 1.44.53.13-.04.25-.08.35-.14l2.13-1.36c.35-.23.74-.4 1.14-.51 1.81-.47 3.7.24 4.76 1.77.65.9.9 2.01.72 3.1a3.85 3.85 0 0 1-1.75 2.6l-5.58 3.55a4.9 4.9 0 0 1-1.16.51z" />
    </svg>
  );
}

export function AngularIcon({ size = 18, ...props }: IconProps & { size?: number }) {
  // Single evenodd path: the "A" is a transparent cutout (not white fill), so
  // the mark sits on any background like the other stroke-based framework
  // icons. viewBox matches the shield bounds so the mark fills the icon box.
  return (
    <svg width={size} height={size} viewBox="31.9 30 186.2 200" {...props}>
      <path
        fill="#DD0031"
        fillRule="evenodd"
        d="M125 30L31.9 63.2l14.2 123.1L125 230l78.9-43.7 14.2-123.1L125 30zm0 22.1l58.2 130.5h-21.7l-11.7-29.2H99.2l-11.7 29.2H65.8L125 52.1zm17 83.3h-34l17-40.9 17 40.9z"
      />
    </svg>
  );
}

export function JsMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={
        small
          ? 'font-display inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-[#F7DF1E] text-[9px] font-extrabold text-black'
          : 'font-display inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-[#F7DF1E] text-[11px] font-extrabold text-black'
      }
    >
      JS
    </span>
  );
}
