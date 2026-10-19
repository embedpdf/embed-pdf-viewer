import { useOutline, useOutlineState } from '@embedpdf/react/outline';

export function OutlineList() {
  const outline = useOutline();
  const { rows, current } = useOutlineState();

  return (
    <ul role="tree">
      {rows.map(({ item, depth, hasChildren, expanded }) => (
        <li
          key={item.ref.objectNumber}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? expanded : undefined}
          aria-current={item.ref.objectNumber === current?.objectNumber ? 'location' : undefined}
          style={{ paddingInlineStart: depth * 16 }}
        >
          {hasChildren && (
            <button onClick={() => outline.toggle(item.ref)}>{expanded ? '▾' : '▸'}</button>
          )}
          <button onClick={() => outline.activate(item.ref)}>{item.title}</button>
        </li>
      ))}
    </ul>
  );
}
