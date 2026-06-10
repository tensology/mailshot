import { useState } from 'react';
import { LogOut, Menu, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { routes } from '../../routes/routes';
import { useAuth } from '../../context/AuthContext';
import { useLayout } from '../../context/LayoutContext';
import IconButton from '../ui/IconButton';

const Header = () => {
    const [searchValue, setSearchValue] = useState('');
    const navigate = useNavigate();
    const { logout, username } = useAuth();
    const { toggleSidebar, searchOpen, setSearchOpen } = useLayout();

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    const submitSearch = (event) => {
        event.preventDefault();
        const query = searchValue.trim();
        if (!query) {
            return;
        }
        setSearchOpen(false);
        navigate(`${routes.emails.path}/allmail?search=${encodeURIComponent(query)}`);
    };

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

                <form
                    onSubmit={submitSearch}
                    className={`ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 transition-all lg:max-w-xl ${
                        searchOpen ? 'fixed inset-x-3 top-3 z-40 bg-white shadow-lg ring-1 ring-slate-200 lg:static lg:shadow-none lg:ring-0' : 'hidden lg:flex'
                    }`}
                >
                    <Search className="h-4 w-4 shrink-0 text-slate-500" />
                    <input
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        placeholder="Search mail"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    {searchOpen && (
                        <button type="button" onClick={() => setSearchOpen(false)} className="text-slate-500 lg:hidden">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </form>

                <div className="ml-auto flex items-center gap-1 lg:ml-0">
                    <IconButton label="Search mail" className="lg:hidden" onClick={() => setSearchOpen(true)}>
                        <Search className="h-5 w-5" />
                    </IconButton>
                    <button
                        type="button"
                        onClick={handleLogout}
                        title={username ? `Signed in as ${username}. Sign out.` : 'Sign out'}
                        className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 sm:flex"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="max-w-[140px] truncate">{username || 'Account'}</span>
                    </button>
                    <IconButton label="Sign out" className="sm:hidden" onClick={handleLogout}>
                        <LogOut className="h-5 w-5" />
                    </IconButton>
                </div>
            </div>
        </header>
    );
};

export default Header;
