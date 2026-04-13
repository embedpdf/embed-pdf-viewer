import { h, Fragment } from 'preact';
import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  useSignatureCapability,
  SignatureDrawPad,
  SignatureDrawPadHandle,
  SignatureTypePad,
  SignatureTypePadHandle,
  useSignatureUpload,
  SignatureFieldDefinition,
  SignatureMode,
} from '@embedpdf/plugin-signature/preact';
import { Dialog } from './ui/dialog';

const SIGNATURE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Caveat&family=Dancing+Script&family=Great+Vibes&family=Pacifico&display=swap';

function ensureSignatureFonts() {
  if (document.querySelector(`link[href="${SIGNATURE_FONTS_URL}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = SIGNATURE_FONTS_URL;
  document.head.appendChild(link);
}

interface SignatureCreateModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
}

type CreationTab = 'draw' | 'type' | 'upload';

interface FieldResult {
  field: SignatureFieldDefinition;
}

const FONTS = [
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Great Vibes', family: "'Great Vibes', cursive" },
  { name: 'Pacifico', family: "'Pacifico', cursive" },
  { name: 'Caveat', family: "'Caveat', cursive" },
];

const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#597ce2' },
  { name: 'Red', value: '#e44234' },
];

export function SignatureCreateModal({
  documentId,
  isOpen,
  onClose,
  onExited,
}: SignatureCreateModalProps) {
  const { translate } = useTranslations(documentId);
  const { provides: signatureCapability } = useSignatureCapability();

  const mode = signatureCapability?.mode ?? SignatureMode.SignatureOnly;
  const needsInitials = mode === SignatureMode.SignatureAndInitials;

  const [activeTab, setActiveTab] = useState<CreationTab>('draw');
  const [selectedFont, setSelectedFont] = useState(FONTS[0].family);
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [sigResult, setSigResult] = useState<FieldResult | null>(null);
  const [iniResult, setIniResult] = useState<FieldResult | null>(null);

  const sigDrawRef = useRef<SignatureDrawPadHandle | null>(null);
  const iniDrawRef = useRef<SignatureDrawPadHandle | null>(null);
  const sigTypeRef = useRef<SignatureTypePadHandle | null>(null);
  const iniTypeRef = useRef<SignatureTypePadHandle | null>(null);

  useEffect(() => {
    if (isOpen) ensureSignatureFonts();
  }, [isOpen]);

  const handleSigResult = useCallback((result: SignatureFieldDefinition | null) => {
    setSigResult(result ? { field: result } : null);
  }, []);

  const handleIniResult = useCallback((result: SignatureFieldDefinition | null) => {
    setIniResult(result ? { field: result } : null);
  }, []);

  const sigUpload = useSignatureUpload({ onResult: handleSigResult });
  const iniUpload = useSignatureUpload({ onResult: handleIniResult });

  const clearAll = useCallback(() => {
    sigDrawRef.current?.clear();
    iniDrawRef.current?.clear();
    sigTypeRef.current?.clear();
    iniTypeRef.current?.clear();
    sigUpload.clear();
    iniUpload.clear();
    setSigResult(null);
    setIniResult(null);
  }, [sigUpload, iniUpload]);

  const resetState = useCallback(() => {
    setActiveTab('draw');
    setSelectedFont(FONTS[0].family);
    setSelectedColor(COLORS[0].value);
    clearAll();
  }, [clearAll]);

  const handleTabChange = useCallback(
    (tab: CreationTab) => {
      clearAll();
      setActiveTab(tab);
    },
    [clearAll],
  );

  const handleSave = useCallback(() => {
    if (!sigResult || !signatureCapability) return;

    signatureCapability.addEntry({
      signature: sigResult.field,
      ...(iniResult && { initials: iniResult.field }),
    });

    resetState();
    onClose?.();
  }, [sigResult, iniResult, signatureCapability, onClose, resetState]);

  const handleClose = useCallback(() => {
    resetState();
    onClose?.();
  }, [resetState, onClose]);

  const canSave = sigResult && (!needsInitials || iniResult);

  const tabs: Array<{ id: CreationTab; label: string }> = [
    { id: 'draw', label: translate('signature.create.draw', { fallback: 'Draw' }) },
    { id: 'type', label: translate('signature.create.type', { fallback: 'Type' }) },
    { id: 'upload', label: translate('signature.create.upload', { fallback: 'Upload' }) },
  ];

  const padHeight = 140;

  return (
    <Dialog
      open={!!isOpen}
      title={translate('signature.create.title', { fallback: 'Create Signature' })}
      onClose={handleClose}
      onExited={onExited}
      className={needsInitials ? 'md:w-[42rem]' : undefined}
    >
      <div class="flex flex-col gap-4">
        {/* Tab selector */}
        <div class="border-border-subtle flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              class={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent border-b-2'
                  : 'text-fg-muted hover:text-fg-primary'
              }`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Pads */}
        <div class="flex gap-4">
          {/* Signature pad */}
          <div class={`flex ${needsInitials ? 'flex-[2]' : 'flex-1'} flex-col gap-2`}>
            <div class="flex items-center justify-between">
              <span class="text-fg-muted text-xs font-medium">
                {translate('signature.create.signatureLabel', { fallback: 'Signature' })}
              </span>
              <button
                class="text-fg-muted hover:text-fg-primary text-xs underline"
                onClick={() => {
                  if (activeTab === 'draw') sigDrawRef.current?.clear();
                  else if (activeTab === 'type') sigTypeRef.current?.clear();
                  else sigUpload.clear();
                }}
              >
                {translate('signature.create.clear', { fallback: 'Clear' })}
              </button>
            </div>

            <div style={{ height: `${padHeight}px` }}>
              {activeTab === 'draw' && (
                <SignatureDrawPad
                  onResult={handleSigResult}
                  padRef={(h) => {
                    sigDrawRef.current = h;
                  }}
                  strokeColor={selectedColor}
                  className="border-border-default rounded border"
                />
              )}
              {activeTab === 'type' && (
                <SignatureTypePad
                  onResult={handleSigResult}
                  padRef={(h) => {
                    sigTypeRef.current = h;
                  }}
                  fontFamily={selectedFont}
                  color={selectedColor}
                  className="border-border-default text-fg-primary rounded border px-3 py-2"
                  placeholder={translate('signature.create.typePlaceholder', {
                    fallback: 'e.g. John Smith',
                  })}
                />
              )}
              {activeTab === 'upload' && (
                <UploadZone
                  upload={sigUpload}
                  height={padHeight}
                  placeholder={translate('signature.create.uploadPlaceholder', {
                    fallback: 'Click or drag an image here',
                  })}
                />
              )}
            </div>
          </div>

          {/* Initials pad */}
          {needsInitials && (
            <div class="flex flex-1 flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-fg-muted text-xs font-medium">
                  {translate('signature.create.initialsLabel', { fallback: 'Initials' })}
                </span>
                <button
                  class="text-fg-muted hover:text-fg-primary text-xs underline"
                  onClick={() => {
                    if (activeTab === 'draw') iniDrawRef.current?.clear();
                    else if (activeTab === 'type') iniTypeRef.current?.clear();
                    else iniUpload.clear();
                  }}
                >
                  {translate('signature.create.clear', { fallback: 'Clear' })}
                </button>
              </div>

              <div style={{ height: `${padHeight}px` }}>
                {activeTab === 'draw' && (
                  <SignatureDrawPad
                    onResult={handleIniResult}
                    padRef={(h) => {
                      iniDrawRef.current = h;
                    }}
                    strokeColor={selectedColor}
                    className="border-border-default rounded border"
                  />
                )}
                {activeTab === 'type' && (
                  <SignatureTypePad
                    onResult={handleIniResult}
                    padRef={(h) => {
                      iniTypeRef.current = h;
                    }}
                    fontFamily={selectedFont}
                    color={selectedColor}
                    className="border-border-default text-fg-primary rounded border px-3 py-2"
                    placeholder={translate('signature.create.initialsPlaceholder', {
                      fallback: 'e.g. JS',
                    })}
                  />
                )}
                {activeTab === 'upload' && (
                  <UploadZone
                    upload={iniUpload}
                    height={padHeight}
                    placeholder={translate('signature.create.uploadPlaceholder', {
                      fallback: 'Click or drag an image here',
                    })}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controls: font selector + color picker */}
        {(activeTab === 'draw' || activeTab === 'type') && (
          <div class="flex items-center gap-4">
            {activeTab === 'type' && (
              <div class="flex items-center gap-2">
                <label class="text-fg-muted text-xs">
                  {translate('signature.create.font', { fallback: 'Font' })}
                </label>
                <select
                  class="border-border-default bg-bg-surface text-fg-primary rounded border px-2 py-1 text-sm"
                  value={selectedFont}
                  onChange={(e) => {
                    setSelectedFont((e.target as HTMLSelectElement).value);
                  }}
                >
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div class="flex items-center gap-2">
              <label class="text-fg-muted text-xs">
                {translate('signature.create.color', { fallback: 'Color' })}
              </label>
              <div class="flex gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    title={c.name}
                    class={`h-6 w-6 rounded-full border-2 transition-all ${
                      selectedColor === c.value
                        ? 'border-accent scale-110'
                        : 'border-border-default hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setSelectedColor(c.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div class="flex justify-end gap-2">
          <button
            class="text-fg-muted hover:text-fg-primary rounded-md px-3 py-1.5 text-sm transition-colors"
            onClick={handleClose}
          >
            {translate('signature.create.cancel', { fallback: 'Cancel' })}
          </button>
          <button
            class="bg-accent hover:bg-accent-hover text-fg-on-accent rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={handleSave}
          >
            {translate('signature.create.save', { fallback: 'Save' })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function UploadZone({
  upload,
  height,
  placeholder,
}: {
  upload: ReturnType<typeof useSignatureUpload>;
  height: number;
  placeholder: string;
}) {
  return (
    <Fragment>
      <input
        ref={upload.inputRef}
        type="file"
        accept={upload.accept}
        onChange={upload.handleFileInputChange}
        style={{ display: 'none' }}
      />
      <div
        onClick={upload.openFilePicker}
        onDrop={upload.handleDrop}
        onDragOver={upload.handleDragOver}
        onDragLeave={upload.handleDragLeave}
        class={`border-border-default flex w-full cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors ${
          upload.isDragging ? 'border-accent bg-accent/5' : 'hover:border-fg-muted'
        }`}
        style={{ height: `${height}px` }}
      >
        {upload.previewUrl ? (
          <img
            src={upload.previewUrl}
            style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
          />
        ) : (
          <span class="text-fg-muted px-4 text-center text-xs">{placeholder}</span>
        )}
      </div>
    </Fragment>
  );
}
