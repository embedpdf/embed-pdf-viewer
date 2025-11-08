export function clickOutside(node: HTMLElement, handler?: () => void) {
  const handleClick = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) {
      handler?.();
    }
  };

  document.addEventListener('click', handleClick, true);

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true);
    },
  };
}
