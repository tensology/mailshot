export const THEME_KEY = 'mailshot_theme';
export const normalizeTheme = (value) => ['light', 'dark', 'system'].includes(value) ? value : 'light';
export const resolveTheme = (preference, systemDark) => preference === 'dark' || (preference === 'system' && systemDark) ? 'dark' : 'light';

export const readTheme = (storage) => {
    try { return normalizeTheme(storage.getItem(THEME_KEY)); }
    catch { return 'light'; }
};

export const applyTheme = (theme, root = document.documentElement) => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
};
