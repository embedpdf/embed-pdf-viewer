import { SvgIcon, SvgIconProps } from '@mui/material';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import { forwardRef } from 'react';

export const PageSettingsIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M6 2C4.89 2 4 2.9 4 4V20C4 21.11 4.89 22 6 22H12V20H6V4H13V9H18V12H20V8L14 2M18 14C17.87 14 17.76 14.09 17.74 14.21L17.55 15.53C17.25 15.66 16.96 15.82 16.7 16L15.46 15.5C15.35 15.5 15.22 15.5 15.15 15.63L14.15 17.36C14.09 17.47 14.11 17.6 14.21 17.68L15.27 18.5C15.25 18.67 15.24 18.83 15.24 19C15.24 19.17 15.25 19.33 15.27 19.5L14.21 20.32C14.12 20.4 14.09 20.53 14.15 20.64L15.15 22.37C15.21 22.5 15.34 22.5 15.46 22.5L16.7 22C16.96 22.18 17.24 22.35 17.55 22.47L17.74 23.79C17.76 23.91 17.86 24 18 24H20C20.11 24 20.22 23.91 20.24 23.79L20.43 22.47C20.73 22.34 21 22.18 21.27 22L22.5 22.5C22.63 22.5 22.76 22.5 22.83 22.37L23.83 20.64C23.89 20.53 23.86 20.4 23.77 20.32L22.7 19.5C22.72 19.33 22.74 19.17 22.74 19C22.74 18.83 22.73 18.67 22.7 18.5L23.76 17.68C23.85 17.6 23.88 17.47 23.82 17.36L22.82 15.63C22.76 15.5 22.63 15.5 22.5 15.5L21.27 16C21 15.82 20.73 15.65 20.42 15.53L20.23 14.21C20.22 14.09 20.11 14 20 14M19 17.5C19.83 17.5 20.5 18.17 20.5 19C20.5 19.83 19.83 20.5 19 20.5C18.16 20.5 17.5 19.83 17.5 19C17.5 18.17 18.17 17.5 19 17.5Z" />
  </SvgIcon>
);

/** Same icon, rotated 180 deg so it "points" the other way. */
export const ViewSidebarReverseIcon = forwardRef<SVGSVGElement, SvgIconProps>((props, ref) => (
  <ViewSidebarOutlinedIcon
    ref={ref}
    {...props}
    sx={{
      transform: 'rotate(180deg)' as const,
      // keep any sx the caller passes:
      ...props.sx,
    }}
  />
));

export const RedactAreaIcon = forwardRef<SVGSVGElement, SvgIconProps>((props, ref) => (
  <SvgIcon ref={ref} {...props} viewBox="0 0 24 24" fill="none">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M6 20h-3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M3 20v-3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M3 13v-3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M3 6v-3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M3 3h3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M10 3h3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M17 3h3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <path d="M20 3v3" stroke="currentColor" strokeWidth={2} strokeLinecap="square" />
    <defs>
      <clipPath id="redactClip">
        <rect x="10" y="10" width="12" height="12" />
      </clipPath>
    </defs>
    <rect
      x="10"
      y="10"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
    />
    <g clipPath="url(#redactClip)">
      <path
        d="M-2 24l14 -14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 24l14 -14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 24l14 -14"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 24l15 -15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 24l15 -15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 24l15 -15"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </SvgIcon>
));

RedactAreaIcon.displayName = 'RedactAreaIcon';

export const RedactIcon = forwardRef<SVGSVGElement, SvgIconProps>((props, ref) => (
  <SvgIcon ref={ref} {...props} viewBox="0 0 24 24" fill="none">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M5 4h14" stroke="currentColor" strokeWidth={3} />
    <path d="M12 4v8" stroke="currentColor" strokeWidth={3} />
    <defs>
      <clipPath id="stripeClip">
        <rect x="2" y="12" width="20" height="10" />
      </clipPath>
    </defs>
    <rect x="2" y="12" width="20" height="10" fill="none" stroke="currentColor" strokeWidth={2} />
    <g clipPath="url(#stripeClip)">
      <path
        d="M-7 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M-3 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 24l12 -12"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </SvgIcon>
));

RedactIcon.displayName = 'RedactIcon';
