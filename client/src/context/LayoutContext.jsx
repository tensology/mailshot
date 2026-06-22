import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '../hooks/useMediaQuery';

const LayoutContext = createContext(null);

const getDefaultSidebarOpen = () => {
    if (typeof window === 'undefined') {
        return true;
    }
    return window.matchMedia('(min-width: 1024px)').matches;
};

export const LayoutProvider = ({ children }) => {
    const isMobile = useIsMobile();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(getDefaultSidebarOpen);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        if (isMobile) {
            setSidebarOpen(false);
        }
    }, [location.pathname, isMobile]);

    const toggleSidebar = useCallback(() => {
        setSidebarOpen((value) => !value);
    }, []);

    const closeSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    const value = useMemo(() => ({
        isMobile,
        sidebarOpen,
        searchOpen,
        setSearchOpen,
        toggleSidebar,
        closeSidebar,
        setSidebarOpen
    }), [isMobile, sidebarOpen, searchOpen, toggleSidebar, closeSidebar]);

    return (
        <LayoutContext.Provider value={value}>
            {children}
        </LayoutContext.Provider>
    );
};

export const useLayout = () => {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error('useLayout must be used within LayoutProvider');
    }
    return context;
};
