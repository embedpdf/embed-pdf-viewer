import { h } from 'preact';
import { useState } from 'preact/hooks';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { PdfErrorCode } from '@embedpdf/models';
import { DocumentState } from '@embedpdf/core';
import { Icon } from './ui/icon';

interface DocumentPasswordPromptProps {
  documentState: DocumentState;
}

export function DocumentPasswordPrompt({ documentState }: DocumentPasswordPromptProps) {
  const { provides } = useDocumentManagerCapability();
  const { translate } = useTranslations();
  const [password, setPassword] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  if (!documentState) return null;

  const { name, errorCode, passwordProvided } = documentState;

  const isPasswordError = errorCode === PdfErrorCode.Password;
  const isPasswordRequired = isPasswordError && !passwordProvided;
  const isPasswordIncorrect = isPasswordError && passwordProvided;

  // Generic error state (not password related)
  if (!isPasswordError) {
    return (
      <div className="bg-bg-app flex h-full items-center justify-center p-8">
        <div className="bg-bg-surface border-border-default flex max-w-sm flex-col items-center rounded-xl border p-6 text-center shadow-lg">
          <div className="bg-state-error-light mb-4 rounded-full p-4">
            <Icon icon="alertTriangle" size={28} className="text-state-error" />
          </div>
          <h3 className="text-fg-primary text-lg font-semibold">
            {translate('documentError.title')}
          </h3>
          <p className="text-fg-secondary mt-2 text-sm">
            {documentState.error || translate('documentError.unknown')}
          </p>
          {errorCode && (
            <p className="text-fg-muted mt-1 text-xs">
              {translate('documentError.errorCode', { params: { code: String(errorCode) } })}
            </p>
          )}
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            className="bg-accent hover:bg-accent-hover text-accent-fg mt-5 w-full cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {translate('documentError.close')}
          </button>
        </div>
      </div>
    );
  }

  const handleRetry = async () => {
    if (!provides || !password.trim()) return;
    setIsRetrying(true);

    const task = provides.retryDocument(documentState.id, { password });
    task.wait(
      () => {
        setPassword('');
        setIsRetrying(false);
      },
      (error) => {
        console.error('Retry failed:', error);
        setIsRetrying(false);
      },
    );
  };

  return (
    <div className="bg-bg-app flex h-full items-center justify-center p-8">
      <div className="bg-bg-surface border-border-default w-full max-w-sm rounded-xl border p-6 shadow-lg">
        {/* Header with centered icon */}
        <div className="flex flex-col items-center text-center">
          <div className="bg-accent-light mb-4 rounded-full p-4">
            <Icon icon="lock" size={28} className="text-accent" />
          </div>
          <h3 className="text-fg-primary text-lg font-semibold">
            {translate('passwordPrompt.title')}
          </h3>
          {name && <p className="text-fg-muted mt-1 text-sm">{name}</p>}
        </div>

        {/* Description */}
        <p className="text-fg-secondary mt-4 text-center text-sm">
          {isPasswordRequired && translate('passwordPrompt.required')}
          {isPasswordIncorrect && translate('passwordPrompt.incorrect')}
        </p>

        {/* Password Input */}
        <div className="mt-5">
          <label className="text-fg-primary mb-1.5 block text-sm font-medium">
            {translate('passwordPrompt.label')}
          </label>
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && !isRetrying && password.trim() && handleRetry()}
            disabled={isRetrying}
            placeholder={translate('passwordPrompt.placeholder')}
            className="bg-bg-input border-border-default focus:border-accent focus:ring-accent text-fg-primary placeholder:text-fg-muted block w-full rounded-md border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
            autoFocus
          />
        </div>

        {/* Incorrect Password Warning */}
        {isPasswordIncorrect && (
          <div className="bg-state-error-light border-state-error mt-3 flex items-center gap-2 rounded-md border p-3">
            <Icon icon="alertTriangle" size={16} className="text-state-error flex-shrink-0" />
            <p className="text-state-error text-sm">
              {translate('passwordPrompt.incorrectWarning')}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="border-border-default text-fg-secondary hover:bg-interactive-hover flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {translate('passwordPrompt.cancel')}
          </button>
          <button
            onClick={handleRetry}
            disabled={isRetrying || !password.trim()}
            className="bg-accent hover:bg-accent-hover text-accent-fg flex-1 cursor-pointer rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetrying ? translate('passwordPrompt.opening') : translate('passwordPrompt.open')}
          </button>
        </div>
      </div>
    </div>
  );
}
