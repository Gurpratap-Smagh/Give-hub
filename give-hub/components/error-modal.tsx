"use client"

import React from 'react'

type ErrorModalProps = {
  isOpen: boolean
  title?: string
  message: string
  onClose: () => void
  details?: unknown
}

export default function ErrorModal({ isOpen, title = "Action Required", message, onClose, details }: ErrorModalProps) {
  if (!isOpen) return null
  let pretty: string | null = null
  if (details !== undefined) {
    try {
      pretty = JSON.stringify(details, null, 2)
    } catch {
      // ignore
    }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop: dark-mode uses deep blue for eye comfort */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-blue-950/80"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl rounded-xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-700 hover:text-black dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div className="mt-3">
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
              {message}
            </p>
          </div>

          {pretty && (
            <div className="mt-4">
              <pre className="max-h-[50vh] overflow-auto text-xs leading-relaxed p-3 rounded-lg bg-white/70 text-black dark:bg-white/10 dark:text-white border border-black/10 dark:border-white/10">
{pretty}
              </pre>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium border border-gray-300 text-gray-900 hover:bg-gray-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
