import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function GitHubIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.49 3.14-1.18 3.14-1.18.63 1.58.24 2.75.12 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function DiscordIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function PlayIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function SearchIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 11, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      {...props}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 12, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function SparkIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
    </svg>
  );
}

export function BoltBadgeIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13 2v7h5a1 1 0 0 1 .868 1.497l-.06.091-8 11c-.568.783-1.808.38-1.808-.588v-6h-5a1 1 0 0 1-.868-1.497l.06-.091 8-11A1 1 0 0 1 13 2z" />
    </svg>
  );
}

export function PuzzleBadgeIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M10 2a3 3 0 0 1 2.995 2.824l.005.176v1h3a2 2 0 0 1 1.995 1.85l.005.15v3h1a3 3 0 0 1 .176 5.995l-.176.005h-1v3a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-1a1 1 0 0 0-1.993-.117l-.007.117v1a2 2 0 0 1-1.85 1.995l-.15.005h-3a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h1a1 1 0 0 0 .117-1.993l-.117-.007h-1a2 2 0 0 1-1.995-1.85l-.005-.15v-3a2 2 0 0 1 1.85-1.995l.15-.005h3v-1a3 3 0 0 1 3-3z" />
    </svg>
  );
}

export function BookIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z" />
      <path d="M19 16h-12a2 2 0 0 0 -2 2" />
      <path d="M9 8h6" />
    </svg>
  );
}

export function StarIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.5 5.8 22l2.4-8.1L2 9.4h7.6z" />
    </svg>
  );
}

export function DownloadIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" />
    </svg>
  );
}

export function ShieldCheckIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ExtLinkIcon({ size = 11, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
      {...props}
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function ChevronDown({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CodeIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m7 8-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
    </svg>
  );
}

export function CopyIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

/* ---- Framework marks ---- */

export function EngineIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
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

export function ReactIcon({
  size = 18,
  color = '#61DAFB',
  ...props
}: IconProps & { color?: string }) {
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

export function VueIcon({
  size = 18,
  color = '#4FC08D',
  ...props
}: IconProps & { color?: string }) {
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

export function SvelteIcon({
  size = 18,
  color = '#FF3E00',
  ...props
}: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} {...props}>
      <path d="M20.68 3.17a7.3 7.3 0 0 0-9.8-2.1l-5.6 3.56a6.36 6.36 0 0 0-2.89 4.3 6.66 6.66 0 0 0 .67 4.33 6.14 6.14 0 0 0-.95 2.4 6.84 6.84 0 0 0 1.16 5.16 7.33 7.33 0 0 0 9.8 2.12l5.6-3.56a6.36 6.36 0 0 0 2.88-4.3 6.66 6.66 0 0 0-.67-4.32 6.79 6.79 0 0 0-.2-7.59zM10.32 21.13a4.43 4.43 0 0 1-4.76-1.77c-.65-.9-.89-2.01-.7-3.11l.11-.53.1-.33.3.2c.66.5 1.4.86 2.19 1.1l.2.07-.02.2c-.02.28.06.59.22.83.33.47.9.7 1.45.55.12-.04.24-.08.34-.14l5.58-3.56c.28-.18.46-.45.53-.77.06-.33-.02-.67-.2-.94-.33-.46-.9-.67-1.45-.53-.12.04-.25.09-.35.15l-2.11 1.34a4.43 4.43 0 0 1-5.9-1.28 4.1 4.1 0 0 1-.7-3.11A3.85 3.85 0 0 1 6.92 6.9l5.57-3.56c.35-.22.73-.38 1.14-.5 1.8-.47 3.7.24 4.76 1.76a4.12 4.12 0 0 1 .57 3.64l-.1.33-.29-.2a7.42 7.42 0 0 0-2.2-1.1l-.2-.06.02-.2c.02-.29-.06-.6-.22-.84-.33-.47-.9-.67-1.45-.53-.12.04-.24.08-.34.14L8.59 9.37c-.28.19-.46.45-.52.78-.06.32.02.67.2.93.32.47.9.67 1.44.53.13-.04.25-.08.35-.14l2.13-1.36c.35-.23.74-.4 1.14-.51 1.81-.47 3.7.24 4.76 1.77.65.9.9 2.01.72 3.1a3.85 3.85 0 0 1-1.75 2.6l-5.58 3.55a4.9 4.9 0 0 1-1.16.51z" />
    </svg>
  );
}

export function AngularIcon({ size = 18, ...props }: IconProps) {
  // Single evenodd path: the "A" is a transparent cutout (not white fill), so
  // the mark sits on any background like the other stroke-based framework icons.
  // viewBox matches the shield bounds (not the original 250² artboard) so the
  // mark fills the icon box like the other framework icons.
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

/* ---- Aliases for the docs components ported from cloudpdf/website (their icon
   vocabulary). Converge the names during the docs polish pass. ---- */
export const ArrowRight = ArrowRightIcon;
export const ExternalLink = ExtLinkIcon;
export const GithubIcon = GitHubIcon;
export const ReactLogo = ReactIcon;
export const VueLogo = VueIcon;
export const SvelteLogo = SvelteIcon;

export function EyeIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a19.6 19.6 0 0 1 4.06-4.94" />
      <path d="M9.9 5.24A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a19.7 19.7 0 0 1-2.67 3.55" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
