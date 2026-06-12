import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cog, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLayout } from '../../context/LayoutContext';
import IconButton from '../ui/IconButton';
import SettingsDialog from '../SettingsDialog';

const Header = () => {
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const accountMenuRef = useRef(null);
    const navigate = useNavigate();
    const { logout, username, isSuperuser } = useAuth();
    const { toggleSidebar } = useLayout();

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    useEffect(() => {
        if (!accountMenuOpen) {
            return undefined;
        }

        const closeOnPointerDown = (event) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
                setAccountMenuOpen(false);
            }
        };

        const closeOnEscape = (event) => {
            if (event.key === 'Escape') {
                setAccountMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', closeOnPointerDown);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnPointerDown);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [accountMenuOpen]);

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
                <IconButton label="Open menu" onClick={toggleSidebar}>
                    <Menu className="h-5 w-5" />
                </IconButton>

                <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                        M
                    </div>
                    <span className="hidden text-base font-semibold text-slate-900 sm:inline">Mailshot</span>
                </div>

                <div className="ml-auto flex items-center gap-1">
                    <div className="relative" ref={accountMenuRef}>
                        <button
                            type="button"
                            onClick={() => setAccountMenuOpen((value) => !value)}
                            aria-expanded={accountMenuOpen}
                            aria-haspopup="menu"
                            title={username ? `Signed in as ${username}` : 'Account settings'}
                            className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 sm:flex"
                        >
                            <Cog className="h-4 w-4" />
                            <span className="max-w-[140px] truncate">{username || 'Account'}</span>
                            <ChevronDown className="h-4 w-4" />
                        </button>
                        <IconButton
                            label="Account settings"
                            className="sm:hidden"
                            onClick={() => setAccountMenuOpen((value) => !value)}
                        >
                            <Cog className="h-5 w-5" />
                        </IconButton>

                        {accountMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                            >
                                <div className="border-b border-slate-100 px-4 py-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Account
                                    </p>
                                    <p className="mt-1 truncate text-sm font-medium text-slate-900">
                                        {username || 'Signed in'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        Session is saved on this device and restored when you reopen Mailshot.
                                    </p>
                                </div>
                                <div className="px-2 py-2">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setAccountMenuOpen(false);
                                            setSettingsOpen(true);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                                    >
                                        <Cog className="h-4 w-4" />
                                        Settings
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <SettingsDialog
                open={settingsOpen}
                isSuperuser={isSuperuser}
                onClose={() => setSettingsOpen(false)}
            />
        </header>
    );
};

export default Header;
