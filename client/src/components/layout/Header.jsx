import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLayout } from '../../context/LayoutContext';
import IconButton from '../ui/IconButton';
import SettingsDialog from '../SettingsDialog';
import MailshotIcon from '../ui/MailshotIcon';
import { getProfilePhoto } from '../../utils/profilePhoto';

const Header = () => {
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const accountMenuRef = useRef(null);
    const navigate = useNavigate();
    const {
        logout,
        username,
        isSuperuser,
        accounts,
        activeAccount,
        activeAccountId,
        hasMultipleAccounts,
        switchAccount
    } = useAuth();
    const { toggleSidebar } = useLayout();
    const profilePhoto = getProfilePhoto(username);

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
        <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
                <IconButton label="Open menu" onClick={toggleSidebar}>
                    <MailshotIcon name="menu" size={24} />
                </IconButton>

                <div className="flex min-w-0 items-center gap-2">
                    <img src="/mailshot-icon-192.png" alt="" className="h-9 w-9 object-contain drop-shadow-sm" />
                    <span className="inline text-base font-semibold text-slate-900">Mailshot</span>
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
                            {profilePhoto
                                ? <img src={profilePhoto} alt="" className="h-7 w-7 rounded-full object-cover object-center" />
                                : <MailshotIcon name="settings" size={20} />}
                            <span className="whitespace-nowrap font-semibold text-slate-900">{activeAccount?.label || username || 'Account'}</span>
                            <MailshotIcon name="chevron-down" size={18} />
                        </button>
                        <IconButton
                            label="Account settings"
                            className="sm:hidden"
                            onClick={() => setAccountMenuOpen((value) => !value)}
                        >
                            {profilePhoto
                                ? <img src={profilePhoto} alt="" className="h-8 w-8 rounded-full object-cover object-center" />
                                : <MailshotIcon name="settings" size={24} />}
                        </IconButton>

                        {accountMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
                            >
                                {hasMultipleAccounts && (
                                    <div className="border-b border-slate-100 px-2 py-2">
                                        <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Mailboxes
                                        </p>
                                        {accounts.map((entry) => {
                                            const isActive = entry.id === activeAccountId;
                                            return (
                                                <button
                                                    key={entry.id}
                                                    type="button"
                                                    role="menuitemradio"
                                                    aria-checked={isActive}
                                                    onClick={() => {
                                                        setAccountMenuOpen(false);
                                                        switchAccount(entry.id);
                                                    }}
                                                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                                                        isActive
                                                            ? 'bg-slate-100 font-semibold text-slate-900'
                                                            : 'text-slate-700 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {entry.logo
                                                        ? <img src={entry.logo} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
                                                        : (
                                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                                                                <MailshotIcon name="settings" size={18} />
                                                            </span>
                                                        )}
                                                    <span className="min-w-0 flex-1 font-semibold text-slate-900">
                                                        {entry.label}
                                                    </span>
                                                    {isActive && <span aria-hidden="true" className="text-slate-500">✓</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="px-2 py-2">
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            setAccountMenuOpen(false);
                                            setSettingsOpen(true);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                                    >
                                        <MailshotIcon name="settings" size={20} />
                                        Settings
                                    </button>
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                                    >
                                        <MailshotIcon name="logout" size={20} />
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
