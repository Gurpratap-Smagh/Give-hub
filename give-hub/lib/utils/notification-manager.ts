/**
 * Re-export notification functions from the components/notification-manager
 * This ensures backward compatibility for any imports from '@/lib/utils/notification-manager'
 * 
 * This approach maintains the unified notification API across the application
 * while preserving backward compatibility for any legacy imports.
 */

export {
  showError,
  showSuccess,
  showInfo,
  showLoading,
  addNotification,
  updateNotification,
  removeNotification,
  clearAllNotifications,
  getNotifications,
  subscribeToNotifications,
  useNotifications
} from '@/components/notification-manager';
