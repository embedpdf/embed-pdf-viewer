'use client'

import React, { useState } from 'react'
import { PdfMetadataObject, PdfTrappedStatus } from '@embedpdf/models'
import { RotateCcw, Plus, Trash2 } from 'lucide-react'

interface MetadataFormProps {
  metadata: PdfMetadataObject
  fileName: string
  onUpdate: (metadata: Partial<PdfMetadataObject>) => void
  onReset: () => void
  isLoading: boolean
}

export const MetadataForm = ({
  metadata,
  fileName,
  onUpdate,
  onReset,
  isLoading,
}: MetadataFormProps) => {
  const [formData, setFormData] = useState({
    title: metadata.title || '',
    author: metadata.author || '',
    subject: metadata.subject || '',
    keywords: metadata.keywords || '',
    creator: metadata.creator || '',
    producer: metadata.producer || '',
  })

  const [trapped, setTrapped] = useState<PdfTrappedStatus | null>(
    metadata.trapped,
  )
  const [customFields, setCustomFields] = useState<
    Record<string, string | null>
  >(metadata.custom || {})
  const [newCustomKey, setNewCustomKey] = useState('')
  const [newCustomValue, setNewCustomValue] = useState('')

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleCustomFieldChange = (key: string, value: string) => {
    setCustomFields((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const addCustomField = () => {
    if (
      newCustomKey.trim() &&
      !customFields.hasOwnProperty(newCustomKey.trim())
    ) {
      setCustomFields((prev) => ({
        ...prev,
        [newCustomKey.trim()]: newCustomValue,
      }))
      setNewCustomKey('')
      setNewCustomValue('')
    }
  }

  const removeCustomField = (key: string) => {
    setCustomFields((prev) => ({
      ...prev,
      [key]: null, // Set to null instead of deleting the key
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Convert empty strings to null for the API
    const updates: Partial<PdfMetadataObject> = {
      title: formData.title.trim() || null,
      author: formData.author.trim() || null,
      subject: formData.subject.trim() || null,
      keywords: formData.keywords.trim() || null,
      creator: formData.creator.trim() || null,
      producer: formData.producer.trim() || null,
      trapped,
      custom: Object.fromEntries(
        Object.entries(customFields).map(([key, value]) => [
          key,
          value?.trim() || null,
        ]),
      ),
    }

    onUpdate(updates)
  }

  const formatDate = (date: Date | null) => {
    return date ? date.toLocaleString() : 'Not set'
  }

  const trappedOptions = [
    { value: PdfTrappedStatus.NotSet, label: 'Not set' },
    { value: PdfTrappedStatus.True, label: 'True' },
    { value: PdfTrappedStatus.False, label: 'False' },
    { value: PdfTrappedStatus.Unknown, label: 'Unknown' },
  ]

  return (
    <div className="mb-12">
      <div className="mx-auto max-w-4xl">
        {/* File info header with gradient glow effect */}
        <div className="group relative mb-8">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-700 opacity-20 blur transition duration-300 dark:opacity-40"></div>
          <div className="relative rounded-2xl bg-white p-6 shadow-md dark:border dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-pink-700 shadow-sm">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Editing PDF Metadata
                </h3>
                <p className="break-all text-gray-600 dark:text-gray-400">
                  {fileName}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main form card with gradient glow */}
        <div className="group relative">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-700 opacity-10 blur transition duration-300 group-hover:opacity-20 dark:opacity-30"></div>
          <div className="relative overflow-hidden rounded-2xl bg-white shadow-md dark:border dark:border-gray-800 dark:bg-gray-900">
            <div className="p-8">
              <h3 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
                Edit Metadata Fields
              </h3>

              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Standard fields */}
                <div>
                  <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Document Information
                  </h4>
                  <div className="grid gap-6 md:grid-cols-2">
                    {Object.entries(formData).map(([key, value]) => (
                      <div key={key}>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) =>
                            handleInputChange(
                              key as keyof typeof formData,
                              e.target.value,
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-4 py-3 transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-900/40"
                          placeholder={`Enter ${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trapped dropdown */}
                <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
                  <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Technical Settings
                  </h4>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Trapped Status
                    </label>
                    <select
                      value={trapped === null ? '' : trapped.toString()}
                      onChange={(e) =>
                        setTrapped(
                          e.target.value === ''
                            ? null
                            : parseInt(e.target.value),
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-3 transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-900/40"
                    >
                      {trappedOptions.map(({ value, label }) => (
                        <option
                          key={value === null ? 'null' : value.toString()}
                          value={value === null ? '' : value.toString()}
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Technical field for professional printing (most users can
                      ignore this)
                    </p>
                  </div>
                </div>

                {/* Read-only date fields */}
                {(metadata.creationDate || metadata.modificationDate) && (
                  <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
                    <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Document Dates (Read-only)
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {metadata.creationDate && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-500 dark:text-gray-400">
                            Creation Date
                          </label>
                          <div className="rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {formatDate(metadata.creationDate)}
                          </div>
                        </div>
                      )}
                      {metadata.modificationDate && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-500 dark:text-gray-400">
                            Last Modified
                          </label>
                          <div className="rounded-lg border border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {formatDate(metadata.modificationDate)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Custom fields */}
                <div className="border-t border-gray-200 pt-8 dark:border-gray-800">
                  <h4 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Custom Properties
                  </h4>

                  {/* Existing custom fields */}
                  {Object.entries(customFields)
                    .filter(([_, value]) => value !== null)
                    .map(([key, value]) => (
                      <div key={key} className="mb-4 flex items-end gap-4">
                        <div className="flex-1">
                          <label className="mb-2 block text-sm font-medium text-gray-500 dark:text-gray-400">
                            {key}
                          </label>
                          <input
                            type="text"
                            value={value || ''}
                            onChange={(e) =>
                              handleCustomFieldChange(key, e.target.value)
                            }
                            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-900/40"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCustomField(key)}
                          className="rounded-lg bg-red-100 px-4 py-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    ))}

                  {/* Add new custom field */}
                  <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
                    <h5 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Add Custom Property
                    </h5>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        type="text"
                        value={newCustomKey}
                        onChange={(e) => setNewCustomKey(e.target.value)}
                        placeholder="Property name"
                        className="rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-900/40"
                      />
                      <input
                        type="text"
                        value={newCustomValue}
                        onChange={(e) => setNewCustomValue(e.target.value)}
                        placeholder="Property value"
                        className="rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-900/40"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addCustomField}
                      disabled={!newCustomKey.trim()}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                    >
                      <Plus className="h-4 w-4" />
                      Add Property
                    </button>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-4 border-t border-gray-200 pt-8 dark:border-gray-800 sm:flex-row">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-700 px-8 py-4 text-lg font-medium text-white transition-all duration-200 hover:shadow-lg disabled:opacity-50 dark:hover:shadow-purple-900/20"
                  >
                    {isLoading ? 'Updating Metadata...' : 'Update Metadata'}
                  </button>
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-8 py-4 text-lg font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Start Over
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
