type OutlineSidebarProps = {
  documentId: string;
};

/**
 * Placeholder Outline Sidebar
 *
 * This component will eventually render the document outline / table of contents.
 * For now it simply renders a placeholder so that we can test tabbed panels.
 */
export function OutlineSidebar({ documentId }: OutlineSidebarProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-4 text-sm text-gray-600">
      <div className="font-medium text-gray-900">Outline (Coming Soon)</div>
      <p>
        Placeholder outline for document{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">{documentId}</code>.
      </p>
      <p className="text-xs">
        Implement the actual outline sidebar by replacing this placeholder with a component that
        reads the document outline from the appropriate plugin.
      </p>
    </div>
  );
}
