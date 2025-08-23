"use client";

import { motion } from 'framer-motion';

export default function NotFound() {
  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center p-8 text-center">
      <div className="relative">
        <motion.div
          initial={{ y: 0, opacity: 0.95 }}
          animate={{ y: [0, -10, 0], opacity: 1 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto h-28 w-28 rounded-full bg-white/80 dark:bg-white/10 shadow-xl ring-1 ring-black/5 flex items-center justify-center"
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8 2 5 5 5 9v7a3 3 0 006 0 3 3 0 006 0V9c0-4-3-7-7-7z" fill="currentColor" className="text-gray-900 dark:text-gray-100" />
            <circle cx="9.5" cy="10" r="1" fill="#000"/>
            <circle cx="14.5" cy="10" r="1" fill="#000"/>
            <path d="M9 13c.5.5 1.5.8 3 .8s2.5-.3 3-.8" stroke="#000" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </motion.div>
        <motion.div
          className="absolute inset-x-0 -bottom-2 mx-auto h-2 w-24 rounded-full bg-black/10 dark:bg-white/10 blur-sm"
          animate={{ opacity: [0.4, 0.15, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="mt-8 space-y-2">
        <div className="text-6xl font-extrabold tracking-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-blue-400">404</span>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">You seem lost</p>
        <a href="/" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition">
          Go home
        </a>
      </div>
    </main>
  );
}
