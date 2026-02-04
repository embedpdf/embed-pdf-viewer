import { FunctionComponent, CSSProperties } from 'preact';

export type IconProps = {
  size?: number;
  strokeWidth?: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  title?: string;
  style?: CSSProperties;
};

export type IconComponent = FunctionComponent<IconProps>;
