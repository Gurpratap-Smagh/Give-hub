'use client';

import { useEffect, useState } from 'react';

interface DonationToastProps {
  isVisible: boolean;
  amount: string;
  onHide?: () => void;
}

export function DonationToast({ isVisible, amount, onHide }: DonationToastProps) {
  const [show, setShow] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        onHide?.();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onHide]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-4 z-50 flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 shadow-lg animate-in slide-in-from-left-2 duration-300">
      <div className="flex-shrink-0">
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-green-800">Donation Successful!</p>
        <p className="text-xs text-green-600">{amount} received on-chain</p>
      </div>
    </div>
  );
}
