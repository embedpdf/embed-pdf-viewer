/**
 * Hook to detect if container width is below a breakpoint
 * Uses synchronous initial measurement to prevent flicker
 *
 * @param getContainer - Function to get the container element
 * @param breakpoint - Width breakpoint in pixels (default: 768)
 * @returns Whether the container is below the breakpoint (mobile)
 */
export declare function useContainerBreakpoint(getContainer: () => HTMLElement | null, breakpoint?: number): boolean;
//# sourceMappingURL=use-container-breakpoint.d.ts.map