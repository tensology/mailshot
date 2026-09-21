const NOTIFICATION_PERMISSION_KEY = 'mailshot:desktop-notifications';

export const areDesktopNotificationsEnabled = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }
    return window.localStorage.getItem(NOTIFICATION_PERMISSION_KEY) === 'granted'
        && Notification.permission === 'granted';
};

export const requestDesktopNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return false;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        window.localStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'granted');
        return true;
    }
    window.localStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'denied');
    return false;
};

export const notifyNewUnreadMail = (count = 0) => {
    if (!areDesktopNotificationsEnabled() || !document.hidden) {
        return;
    }
    const unread = Math.max(0, Number(count) || 0);
    if (unread <= 0) {
        return;
    }
    try {
        new Notification('Mailshot', {
            body: unread === 1 ? '1 unread message' : `${unread} unread messages`,
            tag: 'mailshot-unread'
        });
    } catch {
        // Ignore notification failures (denied mid-session, etc).
    }
};
