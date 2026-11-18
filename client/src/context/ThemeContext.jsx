import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { applyTheme, normalizeTheme, readTheme, resolveTheme, THEME_KEY } from '../utils/theme';

const ThemeContext = createContext(null);
const savedTheme = () => readTheme({ getItem: (key) => window.localStorage.getItem(key) });

export const ThemeProvider = ({ children }) => {
    const [preference, setPreference] = useState(savedTheme);
    const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    const theme = resolveTheme(preference, systemDark);
    useLayoutEffect(() => applyTheme(theme), [theme]);
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => setSystemDark(media.matches);
        const sync = (event) => {
            if (event.key === THEME_KEY || event.key === null) setPreference(savedTheme());
        };
        media.addEventListener('change', update);
        window.addEventListener('storage', sync);
        return () => {
            media.removeEventListener('change', update);
            window.removeEventListener('storage', sync);
        };
    }, []);
    const setTheme = (value) => {
        const next = normalizeTheme(value);
        setPreference(next);
        try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Still works for this session. */ }
    };
    return <ThemeContext.Provider value={{ preference, theme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
