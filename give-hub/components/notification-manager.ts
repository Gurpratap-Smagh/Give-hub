'use client';

import { NotificationType, NotificationDuration } from '@/components/unified-notification';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration: NotificationDuration;
  progress?: number;
  timestamp: number;
}

let notifications: NotificationItem[] = [];
const listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

export function addNotification(
  type: NotificationType,
  title: string,
  message?: string,
  duration: NotificationDuration = 'short',
  progress?: number
): string {
  const id = crypto.randomUUID();
  const notification: NotificationItem = {
    id,
    type,
    title,
    message,
    duration,
    progress,
    timestamp: Date.now()
  };

  notifications = [notification, ...notifications];
  notifyListeners();
  return id;
}

export function updateNotification(
  id: string,
  updates: Partial<Pick<NotificationItem, 'type' | 'title' | 'message' | 'progress'>>
): void {
  notifications = notifications.map(n => 
    n.id === id ? { ...n, ...updates } : n
  );
  notifyListeners();
}

export function removeNotification(id: string): void {
  notifications = notifications.filter(n => n.id !== id);
  notifyListeners();
}

export function clearAllNotifications(): void {
  notifications = [];
  notifyListeners();
}

export function getNotifications(): NotificationItem[] {
  return notifications;
}

export function subscribeToNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Convenience functions with consistent UX patterns
export function showSuccess(title: string, message?: string): string {
  return addNotification('success', title, message, 'short');
}

export function showError(title: string, message?: string): string {
  return addNotification('error', title, message, 'short');
}

export function showInfo(title: string, message?: string): string {
  return addNotification('info', title, message, 'short');
}

export function showLoading(title: string, message?: string, persistent = false): string {
  return addNotification('loading', title, message, persistent ? 'persistent' : 'long');
}

// Hook for React components
import { useEffect, useState } from 'react';

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    setItems(getNotifications());
    const unsubscribe = subscribeToNotifications(() => {
      setItems(getNotifications());
    });
    return unsubscribe;
  }, []);

  return {
    notifications: items,
    addNotification,
    updateNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showInfo,
    showLoading
  };
}
