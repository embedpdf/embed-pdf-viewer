import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { PanelRendererProps, useItemRenderer } from '@embedpdf/plugin-ui/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { Icon } from '@/components/ui/icon';

/**
 * Schema-driven Panel Renderer for Preact
 *
 * Renders panels (sidebars) defined in the UI schema.
 */
export function SchemaPanel({ schema, documentId, isOpen, onClose }: PanelRendererProps) {
  if (!isOpen) return null;

  const { position, content, width, type } = schema;
  const { renderCustomComponent } = useItemRenderer();
  const { translate } = useTranslations(documentId);

  if (type !== 'sidebar') {
    console.warn(`Unsupported panel type: ${type}`);
    return null;
  }

  const positionClasses = getPositionClasses(position?.placement ?? 'left');
  const widthStyle = width ? { width } : undefined;

  return (
    <div
      className={`${positionClasses} flex flex-col border-gray-300 bg-white shadow-lg`}
      style={widthStyle}
      data-panel-id={schema.id}
    >
      {/* Panel Content */}
      <div className="min-h-0 flex-1">
        {content.type === 'tabs' && (
          <TabsContent
            content={content}
            documentId={documentId}
            renderCustomComponent={renderCustomComponent}
          />
        )}
        {content.type === 'component' && (
          <>{renderCustomComponent(content.componentId, documentId, {})}</>
        )}
      </div>
    </div>
  );
}

/**
 * Renders tabs content
 */
function TabsContent({
  content,
  documentId,
  renderCustomComponent,
}: {
  content: Extract<PanelRendererProps['schema']['content'], { type: 'tabs' }>;
  documentId: string;
  renderCustomComponent: (componentId: string, documentId: string, props: any) => any;
}) {
  const [activeTab, setActiveTab] = useState(content.tabs[0]?.id || '');
  const { translate } = useTranslations(documentId);

  return (
    <div className="flex h-full flex-1 flex-col">
      {/* Tab Buttons */}
      <div role="tablist" className="mx-4 my-4 flex flex-shrink-0 overflow-hidden bg-white">
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
      <div className="min-h-0 flex-1">
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
 * Get position classes for panel positioning
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
