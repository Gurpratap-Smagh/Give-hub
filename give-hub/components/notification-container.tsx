'use client';

import { useNotifications } from '@/components/notification-manager';
import { UnifiedNotification, CompactNotification } from './unified-notification';

export function NotificationContainer() {
  const { notifications, removeNotification } = useNotifications();

  // Get the most recent loading notification for compact display
  const loadingNotification = notifications.find(n => n.type === 'loading' && n.duration === 'long');
  const otherNotifications = notifications.filter(n => !(n.type === 'loading' && n.duration === 'long'));

  return (
    <>
      {/* Regular notifications stack */}
      <div className="fixed top-6 right-6 z-[1000] flex flex-col gap-3 pointer-events-none">
        {otherNotifications.map((notification) => (
          <UnifiedNotification
            key={notification.id}
            id={notification.id}
            type={notification.type}
            title={notification.title}
            message={notification.message}
            duration={notification.duration}
            progress={notification.progress}
            isVisible={true}
            onDismiss={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      {/* Compact loading notification in corner */}
      {loadingNotification && (
        <CompactNotification
          isVisible={true}
          type="loading"
          progress={loadingNotification.progress}
        />
      )}
    </>
  );
}
