import { VNode } from 'preact';
type IconProps = {
    icon: string;
    size?: number;
    strokeWidth?: number;
    primaryColor?: string;
    secondaryColor?: string;
    className?: string;
    title?: string;
};
/**
 * Icon component for Preact
 *
 * Renders icons from:
 * 1. Built-in icon components (defined in ./icons)
 * 2. Custom registered icons (registered via registerIcon)
 */
export declare function Icon({ icon, title, size, strokeWidth, primaryColor, secondaryColor, className, }: IconProps): VNode | null;
export {};
//# sourceMappingURL=icon.d.ts.map