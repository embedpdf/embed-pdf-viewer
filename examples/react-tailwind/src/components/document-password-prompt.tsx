import { useState } from 'react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { PdfErrorCode } from '@embedpdf/models';
import { AlertIcon } from './icons';
import { DocumentState } from '@embedpdf/core';

interface DocumentPasswordPromptProps {
  documentState: DocumentState;
}

export function DocumentPasswordPrompt({ documentState }: DocumentPasswordPromptProps) {
  const { provides } = useDocumentManagerCapability();
  const [password, setPassword] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);

  if (!documentState) return null;

  const { name, errorCode, passwordProvided } = documentState;

  // Clean logic using state + error code!
  const isPasswordError = errorCode === PdfErrorCode.Password;
  const isPasswordRequired = isPasswordError && !passwordProvided;
  const isPasswordIncorrect = isPasswordError && passwordProvided;

  if (!isPasswordError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-lg bg-red-50 p-6 text-center">
          <AlertIcon className="mx-auto h-12 w-12 text-red-600" />
          <h3 className="mt-4 text-lg font-medium text-red-900">Error loading document</h3>
          <p className="mt-2 text-sm text-red-700">
            {documentState.error || 'An unknown error occurred'}
          </p>
          {errorCode && <p className="mt-1 text-xs text-red-600">Error Code: {errorCode}</p>}
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            className="mt-4 rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
          >
            Close Document
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
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Password Required</h3>
            {name && <p className="mt-1 text-sm text-gray-600">{name}</p>}
          </div>
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Different message based on state */}
        <p className="mt-4 text-sm text-amber-800">
          {isPasswordRequired &&
            'This document is password protected. Please enter the password to open it.'}
          {isPasswordIncorrect && 'The password you entered was incorrect. Please try again.'}
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isRetrying && password.trim() && handleRetry()}
            disabled={isRetrying}
            placeholder="Enter document password"
            className="mt-1 block w-full rounded-md border px-3 py-2"
            autoFocus
          />
        </div>

        {/* Show error feedback for incorrect password */}
        {isPasswordIncorrect && (
          <div className="mt-3 rounded-md bg-amber-800 p-3">
            <p className="text-sm text-white">Incorrect password. Please check and try again.</p>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={() => provides?.closeDocument(documentState.id)}
            disabled={isRetrying}
            className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleRetry}
            disabled={isRetrying || !password.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isRetrying ? 'Opening...' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}
