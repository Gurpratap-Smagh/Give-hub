'use client';

let isProcessing = false;
let message = 'Processing donation...';
let status: 'processing' | 'success' | 'error' = 'processing';
const listeners: Set<() => void> = new Set();

export function setDonationProcessing(value: boolean) {
  isProcessing = value;
  if (!value) {
    // Reset when hiding
    message = 'Processing donation...';
    status = 'processing';
  }
  notifyListeners();
}

export function setDonationMessage(msg: string) {
  message = msg;
  notifyListeners();
}

export function setDonationStatus(s: 'processing' | 'success' | 'error') {
  status = s;
  notifyListeners();
}

export function getDonationState() {
  return { isProcessing, message, status };
}

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export function subscribeDonationProcessing(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Hook for React components
import { useEffect, useState } from 'react';

export function useDonationProcessing() {
  const [state, setState] = useState(getDonationState());

  useEffect(() => {
    setState(getDonationState());
    const unsubscribe = subscribeDonationProcessing(() => {
      setState(getDonationState());
    });
    return unsubscribe;
  }, []);

  return state;
}
