'use client';
import React, { useState } from 'react';
import { openProtectedPdf } from './get-last-error-example';
import { Preview } from '@/components/preview';

export default function GetLastErrorDemo() {
  const [result, setResult] = useState<{
    success: boolean;
    errorCode?: number;
    errorMessage?: string;
    pageCount?: number;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenWithoutPassword = async () => {
    try {
      setIsLoading(true);
      setResult(null);
      
      const response = await fetch('/demo_protected.pdf');
      const buffer = await response.arrayBuffer();
      const result = await openProtectedPdf(new Uint8Array(buffer));
      
      setResult(result);
    } catch (err) {
      setResult({
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenWithPassword = async () => {
    try {
      setIsLoading(true);
      setResult(null);
      
      const response = await fetch('/demo_protected.pdf');
      const buffer = await response.arrayBuffer();
      const result = await openProtectedPdf(new Uint8Array(buffer), password);
      
      setResult(result);
    } catch (err) {
      setResult({
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Preview title="Handle PDF Password Error">
      <div className="space-y-4">
        <div className="flex space-x-2">
          <button
            onClick={handleOpenWithoutPassword}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-800 rounded-md hover:bg-violet-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:bg-gray-400"
          >
            Open Protected PDF (No Password)
          </button>
        </div>

        {result && !result.success && result.errorCode === 4 && (
          <div className="mt-4">
            <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
              Error: {result.errorMessage} (Code: {result.errorCode})
            </p>
            <p className="bg-blue-100 border rounded-md border-blue-500 text-blue-700 px-4 py-3 mb-4">
              Hint: The password is "embedpdf"
            </p>
            <div className="flex space-x-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter PDF password"
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleOpenWithPassword}
                disabled={isLoading || !password}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-800 rounded-md hover:bg-violet-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500 disabled:bg-gray-400"
              >
                Try with Password
              </button>
            </div>
          </div>
        )}

        {result && result.success && (
          <div className="mt-4 p-4 bg-green-50 text-green-700 rounded-md border border-green-500">
            <p>PDF opened successfully!</p>
            <p>Number of pages: {result.pageCount}</p>
          </div>
        )}

        {result && !result.success && result.errorCode !== 4 && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
            <p>
              Error: {result.errorMessage} (Code: {result.errorCode})
            </p>
          </div>
        )}

        {isLoading && (
          <div className="mt-4">
            <p>Loading...</p>
          </div>
        )}
      </div>
    </Preview>
  );
} 