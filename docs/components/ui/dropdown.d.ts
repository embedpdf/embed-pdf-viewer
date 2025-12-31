import { h, ComponentChildren } from 'preact';
export interface DropdownProps {
    /** Controlled visibility — `true` shows, `false` hides */
    open: boolean;
    /** Reference element that anchors the menu (button, icon, …) */
    trigger?: HTMLElement;
    /** Menu items / JSX content */
    children: ComponentChildren;
    /** Preferred placement (Floating‑UI keywords). Default `"bottom-start"` */
    placement?: string;
    /** Horizontal offset (skidding) */
    offsetSkidding?: number;
    /** Vertical offset (distance) */
    offsetDistance?: number;
    /** Optional fade‑out delay when hiding (ms) */
    delay?: number;
    /** Callbacks */
    onShow?: () => void;
    onHide?: () => void;
    className?: string;
}
export declare function Dropdown({ open, trigger, children, placement, offsetSkidding, offsetDistance, delay, onShow, onHide, className, }: DropdownProps): h.JSX.Element;
//# sourceMappingURL=dropdown.d.ts.map