'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type FancyItem = {
  kind: 'header' | 'option';
  key: string;
  label: string;
  value?: string;
  icon?: string; // simple emoji/icon string to avoid assets
  disabled?: boolean;
};

interface FancySelectProps {
  items: FancyItem[];
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export default function FancySelect({
  items,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select…',
  className = '',
}: FancySelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => items.filter(i => i.kind === 'option' && !i.disabled), [items]);
  const selected = useMemo(() => options.find(i => i.value === value), [options, value]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIdx(-1);
  }, []);

  // Click outside to close
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) close();
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick);
      return () => document.removeEventListener('mousedown', onDocClick);
    }
  }, [open, close]);

  const selectByIndex = useCallback((idx: number) => {
    const item = options[idx];
    if (!item || !item.value) return;
    onChange(item.value);
    close();
  }, [options, onChange, close]);

  const onButtonKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIdx(Math.max(0, options.findIndex(i => i.value === value)));
      } else if (e.key !== ' ') {
        // Enter/ArrowDown while open selects/advances
        if (e.key === 'Enter') selectByIndex(activeIdx >= 0 ? activeIdx : 0);
        if (e.key === 'ArrowDown') setActiveIdx(p => Math.min((p < 0 ? -1 : p) + 1, options.length - 1));
      }
    }
  }, [disabled, open, options, value, activeIdx, selectByIndex]);

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min((i < 0 ? -1 : i) + 1, options.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max((i < 0 ? options.length : i) - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectByIndex(activeIdx >= 0 ? activeIdx : 0);
    }
  }, [options.length, activeIdx, close, selectByIndex]);

  const triggerText = selected ? selected.label : placeholder;
  const triggerIcon = selected?.icon;

  return (
    <div ref={rootRef} className={`relative token-picker ${className}`}>
      <div className="relative rounded-full">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(v => !v)}
          onKeyDown={onButtonKeyDown}
          className="w-full rounded-full border border-transparent ring-1 ring-blue-300 dark:ring-blue-400 select-surface px-4 py-2 text-left text-blue-600 disabled:text-blue-600 shadow-md hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-600/80 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between gap-2"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="inline-flex items-center gap-2">
            {triggerIcon ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm text-blue-600">
                {triggerIcon}
              </span>
            ) : null}
            <span className="truncate">{triggerText}</span>
          </span>
          <svg
            className={`h-4 w-4 text-blue-600 disabled:text-blue-600 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.25 8.29a.75.75 0 01-.02-1.08z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full left-0 right-0">
          <div className="rounded-lg border border-gray-200 bg-white shadow-lg">
            <ul
              role="listbox"
              tabIndex={-1}
              onKeyDown={onMenuKeyDown}
              className="max-h-64 overflow-auto rounded-lg bg-white text-gray-700"
            >
              {items.map((item) => {
                if (item.kind === 'header') {
                  return (
                    <li
                      key={item.key}
                      className="px-3 py-1.5 text-xs uppercase tracking-wide text-blue-500/80 bg-transparent sticky top-0"
                      aria-hidden
                    >
                      {item.label}
                    </li>
                  );
                }
                const optionIdx = options.findIndex(o => o.key === item.key);
                const selected = value === item.value;
                return (
                  <li
                    key={item.key}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIdx(optionIdx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (item.value) {
                        onChange(item.value);
                        close();
                      }
                    }}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors select-none
                      ${selected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}
                    `}
                  >
                    {item.icon ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sm text-blue-600">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="truncate">{item.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
