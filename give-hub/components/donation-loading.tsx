'use client';

import { useEffect, useState } from 'react';

interface DonationLoadingProps {
  isVisible: boolean;
  message?: string;
  isError?: boolean;
  isSuccess?: boolean;
}

export function DonationLoading({ isVisible, message = 'Processing donation...', isError = false, isSuccess = false }: DonationLoadingProps) {
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!isVisible || isError || isSuccess) {
      setTimeElapsed(0);
      return;
    }
    
    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isVisible, isError, isSuccess]);

  const bgColor = isError ? 'bg-red-50/90' : isSuccess ? 'bg-green-50/90' : 'bg-white/90';
  const borderColor = isError ? 'border-red-200' : isSuccess ? 'border-green-200' : 'border-gray-200';
  const textColor = isError ? 'text-red-700' : isSuccess ? 'text-green-700' : 'text-gray-700';

  if (!isVisible) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 ${bgColor} backdrop-blur-sm border ${borderColor} rounded-lg px-4 py-3 shadow-lg transition-all duration-300`}>
      {!isError && !isSuccess && (
        <div className="w-5 h-5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>
      )}
      {isError && (
        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {isSuccess && (
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${textColor}`}>{message}</span>
        {!isError && !isSuccess && timeElapsed > 10 && (
          <span className="text-xs text-gray-500 mt-0.5">
            {timeElapsed < 60 ? `${timeElapsed}s` : `${Math.floor(timeElapsed / 60)}m ${timeElapsed % 60}s`} elapsed
          </span>
        )}
      </div>
    </div>
  );
}
