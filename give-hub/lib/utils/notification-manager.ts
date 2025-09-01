import { toast } from 'sonner';
import { UnifiedNotification, NotificationType } from '@/components/unified-notification';

/**
 * Shows an error notification
 * @param message - The error message to display
 * @param duration - Duration to show the notification ('short' or 'long')
 */
export function showError(message: string, duration: 'short' | 'long' = 'short'): void {
  toast.custom((t) => (
    <UnifiedNotification
      type="error"
      message={message}
      onDismiss={() => toast.dismiss(t)}
      duration={duration}
    />
  ), {
    duration: duration === 'short' ? 5000 : 12000,
  });
}

/**
 * Shows a success notification
 * @param message - The success message to display
 * @param duration - Duration to show the notification ('short' or 'long')
 */
export function showSuccess(message: string, duration: 'short' | 'long' = 'short'): void {
  toast.custom((t) => (
    <UnifiedNotification
      type="success"
      message={message}
      onDismiss={() => toast.dismiss(t)}
      duration={duration}
    />
  ), {
    duration: duration === 'short' ? 5000 : 12000,
  });
}

/**
 * Shows a loading notification that can be updated
 * @param message - The loading message to display
 * @param duration - Duration before compacting ('short' or 'long')
 * @returns A function to update the notification
 */
export function showLoading(message: string, duration: 'short' | 'long' = 'long'): (update: { message?: string; type?: NotificationType; progress?: number }) => void {
  const toastId = toast.custom((t) => (
    <UnifiedNotification
      type="loading"
      message={message}
      onDismiss={() => toast.dismiss(t)}
      duration={duration}
    />
  ), {
    duration: duration === 'short' ? 5000 : Infinity, // Don't auto-dismiss loading
  });

  return (update: { message?: string; type?: NotificationType; progress?: number }) => {
    if (update.type === 'success' || update.type === 'error') {
      toast.dismiss(toastId);
      if (update.message) {
        toast.custom((t) => (
          <UnifiedNotification
            type={update.type!}
            message={update.message}
            onDismiss={() => toast.dismiss(t)}
            duration="short"
          />
        ), { duration: 5000 });
      }
    } else {
      // Update the existing loading notification
      toast.custom((t) => (
        <UnifiedNotification
          type={update.type || 'loading'}
          message={update.message || message}
          onDismiss={() => toast.dismiss(t)}
          progress={update.progress}
          duration={duration}
        />
      ), {
        id: toastId,
        duration: Infinity,
      });
    }
  };
}

// Export toast for direct usage if needed
export { toast };
