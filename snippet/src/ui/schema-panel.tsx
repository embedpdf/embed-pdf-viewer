import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { PanelRendererProps, useItemRenderer } from '@embedpdf/plugin-ui/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

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
      <div className="flex-1 overflow-auto">
        {content.type === 'tabs' && (
          <TabsContent
            content={content}
            documentId={documentId}
            renderCustomComponent={renderCustomComponent}
          />
        )}
        {content.type === 'component' && (
          <div>{renderCustomComponent(content.componentId, documentId, {})}</div>
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

  return (
    <div className="flex h-full flex-col">
      {/* Tab Buttons */}
      <div className="flex flex-shrink-0 border-b border-gray-300">
        {content.tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
