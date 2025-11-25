import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState, useRef } from 'preact/hooks';
import {
  PanelRendererProps,
  useUICapability,
  useUIState,
  useItemRenderer,
} from '@embedpdf/plugin-ui/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { Button } from '@/components/ui/button';
import { XIcon } from '@/components/icons/x';

/**
 * Schema-driven Panel Renderer for Preact
 *
 * Renders panels (sidebars) defined in the UI schema.
 */
export function SchemaPanel({ schema, documentId, isOpen, onClose }: PanelRendererProps) {
  if (!isOpen) return null;

  const { position, content, width, type } = schema;
  const { provides } = useUICapability();
  const uiState = useUIState(documentId);
  const { renderCustomComponent } = useItemRenderer();
  const { translate } = useTranslations(documentId);

  if (type !== 'sidebar') {
    console.warn(`Unsupported panel type: ${type}`);
    return null;
  }

  const positionClasses = getPositionClasses(position?.placement ?? 'left');
  const widthStyle = width ? { width } : undefined;

  const scope = useMemo(
    () => (provides ? provides.forDocument(documentId) : null),
    [provides, documentId],
  );

  return (
    <div
      className={`${positionClasses} flex flex-col border-gray-300 bg-white shadow-lg`}
      style={widthStyle}
      data-panel-id={schema.id}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-300 p-3">
        <h3 className="text-sm font-semibold">
          {schema.content.type === 'tabs'
            ? translate('panel.sidebar')
            : translate(`panel.${schema.id.replace('-panel', '')}`)}
        </h3>
        {onClose && (
          <Button onClick={onClose} className="p-1">
            <XIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

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
          <div className="p-4">{renderCustomComponent(content.componentId, documentId, {})}</div>
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
    <>
      {/* Tab Buttons */}
      <div className="flex border-b border-gray-300">
        {content.tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
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
      <div className="p-4">
        {content.tabs
          .filter((tab) => tab.id === activeTab)
          .map((tab) => (
            <div key={tab.id}>{renderCustomComponent(tab.componentId, documentId, {})}</div>
          ))}
      </div>
    </>
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
