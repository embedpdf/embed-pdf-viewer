import { h, ComponentChildren } from 'preact';
import { Placement } from '@floating-ui/dom';
interface TooltipProps {
    children: ComponentChildren;
    content: ComponentChildren;
    position?: Placement;
    className?: string;
    delay?: number;
    style?: 'light' | 'dark';
    trigger?: 'hover' | 'click' | 'none';
}
export declare function Tooltip({ children, content, position, className, delay, style, trigger, }: TooltipProps): h.JSX.Element;
export {};
//# sourceMappingURL=tooltip.d.ts.map