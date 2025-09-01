'use client';

import { useEffect, useState } from 'react';

export type NotificationType = 'info' | 'success' | 'error' | 'loading';
export type NotificationDuration = 'short' | 'long' | 'persistent';

interface NotificationProps {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration: NotificationDuration;
  isVisible: boolean;
  onDismiss: () => void;
  progress?: number; // 0-100 for loading states
}

interface CompactNotificationProps {
  isVisible: boolean;
  type: NotificationType;
  progress?: number;
}

// Compact corner notification for long-running processes
export function CompactNotification({ isVisible, type, progress }: CompactNotificationProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[999] transition-all duration-500 ease-out transform animate-in slide-in-from-bottom-2">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-transparent backdrop-blur-md border border-blue-600 shadow-lg hover:bg-blue-600/10 transition-colors cursor-pointer">
        {type === 'loading' && (
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 border-2 border-blue-600/30 rounded-full"></div>
            <div 
              className="absolute inset-0 border-2 border-blue-600 rounded-full border-t-transparent animate-spin"
              style={{
                transform: progress ? `rotate(${(progress / 100) * 360}deg)` : undefined
              }}
            ></div>
            <div className="absolute inset-2 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            </div>
          </div>
        )}
        {type === 'success' && (
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {type === 'error' && (
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
    </div>
  );
}

// Main notification component
export function UnifiedNotification({ type, title, message, duration, isVisible, onDismiss, progress }: NotificationProps) {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    if (!isVisible) {
      setTimeElapsed(0);
      setIsCompact(false);
      return;
    }

    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    let timeout: NodeJS.Timeout;

    if (duration === 'short') {
      timeout = setTimeout(onDismiss, 5000);
    } else if (duration === 'long' && type === 'loading') {
      // After 8 seconds, compact loading notifications for better UX
      timeout = setTimeout(() => {
        setIsCompact(true);
      }, 8000);
    } else if (duration === 'long' && type !== 'loading') {
      // Auto-dismiss other long notifications after 12 seconds
      timeout = setTimeout(onDismiss, 12000);
    }

    return () => clearTimeout(timeout);
  }, [isVisible, duration, type, onDismiss]);

  if (!isVisible) return null;

  // Show compact version for long-running loading processes
  if (isCompact && type === 'loading') {
    return <CompactNotification isVisible={true} type={type} progress={progress} />;
  }

  const getIconAndStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: (
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          bgClass: 'bg-white/90 backdrop-blur-md',
          borderClass: 'border-green-200 ring-1 ring-green-200/50',
          titleClass: 'text-green-800',
          messageClass: 'text-green-600'
        };
      case 'error':
        return {
          icon: (
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          bgClass: 'bg-white/90 backdrop-blur-md',
          borderClass: 'border-red-200 ring-1 ring-red-200/50',
          titleClass: 'text-red-800',
          messageClass: 'text-red-600'
        };
      case 'loading':
        return {
          icon: (
            <div className="relative w-5 h-5">
              <div className="absolute inset-0 border-2 border-blue-600/30 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
          ),
          bgClass: 'bg-white/90 backdrop-blur-md',
          borderClass: 'border-blue-600 ring-1 ring-blue-600/50',
          titleClass: 'text-blue-800',
          messageClass: 'text-blue-600'
        };
      default:
        return {
          icon: (
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          bgClass: 'bg-white/90 backdrop-blur-md',
          borderClass: 'border-blue-600 ring-1 ring-blue-600/50',
          titleClass: 'text-blue-800',
          messageClass: 'text-blue-600'
        };
    }
  };

  const { icon, bgClass, borderClass, titleClass, messageClass } = getIconAndStyles();

  return (
    <div className="pointer-events-auto transition-all duration-300 ease-out transform animate-in slide-in-from-right-2">
      <div className={`
        min-w-[280px] max-w-sm 
        rounded-lg shadow-lg border
        px-4 py-3 flex items-start gap-3
        ${bgClass} ${borderClass}
      `}>
        <div className="flex-shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${titleClass}`}>{title}</p>
          {message && (
            <p className={`text-xs mt-1 ${messageClass}`}>{message}</p>
          )}
          {type === 'loading' && duration === 'long' && timeElapsed > 5 && (
            <p className="text-xs text-gray-500 mt-1">
              {timeElapsed < 60 ? `${timeElapsed}s` : `${Math.floor(timeElapsed / 60)}m ${timeElapsed % 60}s`} elapsed
            </p>
          )}
        </div>
        {duration !== 'persistent' && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
