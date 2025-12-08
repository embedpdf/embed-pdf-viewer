import { h, Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import { SidebarRendererProps, useItemRenderer, useUIContainer } from '@embedpdf/plugin-ui/preact';
import { Icon } from '@/components/ui/icon';
import { BottomSheet } from './components/bottom-sheet';
import { useContainerBreakpoint } from './hooks/use-container-breakpoint';

// Breakpoint for mobile drawer behavior
const MOBILE_BREAKPOINT = 768;

// Sidebar snap points: closed (0%), half (50%), full (100%)
const SIDEBAR_SNAP_POINTS = [0, 50, 100];

/**
 * Schema-driven Sidebar Renderer for Preact
 *
 * On large containers: Traditional sidebar (left/right)
 * On small containers: Bottom drawer with drag-to-resize
 */
export function SchemaSidebar({ schema, documentId, isOpen, onClose }: SidebarRendererProps) {
  const { getContainer } = useUIContainer();
  const isMobile = useContainerBreakpoint(getContainer, MOBILE_BREAKPOINT);

  const { position, content, width } = schema;
  const { renderCustomComponent } = useItemRenderer();
  const container = getContainer();

  // Mobile: render as bottom drawer
  if (isMobile && container) {
    return createPortal(
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        container={container}
        config={{
          snapPoints: SIDEBAR_SNAP_POINTS,
          initialSnapIndex: 1, // Start at 50%
          closeOnDragDown: true,
          closeThreshold: 25,
        }}
      >
        <SidebarContent
          content={content}
          documentId={documentId}
          renderCustomComponent={renderCustomComponent}
        />
      </BottomSheet>,
      container,
    );
  }

  // Desktop: render as traditional sidebar
  if (!isOpen) return null;

  const positionClasses = getPositionClasses(position.placement);
  const widthStyle = width ? { width } : undefined;

  return (
    <div
      className={`${positionClasses} flex flex-col border-gray-300 bg-white shadow-lg`}
      style={widthStyle}
      data-sidebar-id={schema.id}
    >
      <div className="min-h-0 flex-1">
        <SidebarContent
          content={content}
          documentId={documentId}
          renderCustomComponent={renderCustomComponent}
        />
      </div>
    </div>
  );
}

/**
 * Sidebar content renderer (shared between mobile and desktop)
 */
function SidebarContent({
  content,
  documentId,
  renderCustomComponent,
}: {
  content: SidebarRendererProps['schema']['content'];
  documentId: string;
  renderCustomComponent: (componentId: string, documentId: string, props: any) => any;
}) {
  if (content.type === 'component') {
    return <>{renderCustomComponent(content.componentId, documentId, {})}</>;
  }

  if (content.type === 'tabs') {
    return (
      <TabsContent
        content={content}
        documentId={documentId}
        renderCustomComponent={renderCustomComponent}
      />
    );
  }

  return null;
}

/**
 * Renders tabs content
 */
function TabsContent({
  content,
  documentId,
  renderCustomComponent,
}: {
  content: Extract<SidebarRendererProps['schema']['content'], { type: 'tabs' }>;
  documentId: string;
  renderCustomComponent: (componentId: string, documentId: string, props: any) => any;
}) {
  const [activeTab, setActiveTab] = useState(content.tabs[0]?.id || '');

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Tab Buttons */}
      <div role="tablist" className="mx-4 mb-4 flex flex-shrink-0 overflow-hidden bg-white">
        {content.tabs.map((tab, idx, array) => {
          const isActive = activeTab === tab.id;
          const isFirst = idx === 0;
          const isLast = idx === array.length - 1;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex h-7 flex-1 cursor-pointer items-center justify-center border outline-none transition-colors ${
                isFirst ? 'rounded-l-md' : ''
              } ${isLast ? 'rounded-r-md' : ''} ${!isLast ? 'border-r-0' : ''} ${
                isActive
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.icon && <Icon icon={tab.icon} className="h-5 w-5" />}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {content.tabs
          .filter((tab) => tab.id === activeTab)
          .map((tab) => (
            <Fragment key={tab.id}>
              {renderCustomComponent(tab.componentId, documentId, {})}
            </Fragment>
          ))}
      </div>
    </div>
  );
}

/**
 * Get position classes for sidebar positioning
 */
function getPositionClasses(placement: 'left' | 'right' | 'top' | 'bottom'): string {
  switch (placement) {
    case 'left':
      return 'border-r';
    case 'right':
      return 'border-l';
    case 'top':
      return 'border-b';
    case 'bottom':
      return 'border-t';
  }
}
