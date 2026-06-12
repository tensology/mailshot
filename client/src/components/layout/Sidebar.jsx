import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PenSquare } from 'lucide-react';
import { SIDEBAR_DATA } from '../../config/sidebar.config';
import { routes } from '../../routes/routes';
import { useLayout } from '../../context/LayoutContext';
import { useCompose } from '../../context/ComposeContext';
import useApi from '../../hooks/useApi';
import { API_URLS } from '../../services/api.urls';
import LabelSidebar from '../LabelSidebar';
import ContactSidebar from '../ContactSidebar';
import ComposeMail from '../ComposeMail';

const navClass = ({ isActive }) => (
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
    }`
);

const Sidebar = ({ onSent }) => {
    const { type } = useParams();
    const [searchParams] = useSearchParams();
    const activeLabel = searchParams.get('label') || '';
    const { isMobile, sidebarOpen, closeSidebar } = useLayout();
    const { openCompose } = useCompose();
    const getMailboxCountsService = useApi(API_URLS.getMailboxCounts);
    const [counts, setCounts] = useState({ inbox_unread: 0 });

    useEffect(() => {
        const refreshCounts = () => getMailboxCountsService.call({}, '', { silent: true }).then((result) => {
            if (!result.error) {
                setCounts(result.data || { inbox_unread: 0 });
            }
        });

        refreshCounts();
        window.addEventListener('mailshot:counts-refresh', refreshCounts);
        return () => window.removeEventListener('mailshot:counts-refresh', refreshCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);

    const handleCompose = () => {
        openCompose();
        if (isMobile) {
            closeSidebar();
        }
    };

    const handleNavigate = () => {
        if (isMobile) {
            closeSidebar();
        }
    };

    return (
        <>
            {sidebarOpen && isMobile && (
                <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]"
                    onClick={closeSidebar}
                />
            )}

            <aside
                className={`flex flex-col border-r border-slate-200 bg-white transition-all duration-200 ${
                    isMobile
                        ? `fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'}`
                        : `${sidebarOpen ? 'w-64 shrink-0' : 'w-0 shrink-0 overflow-hidden border-r-0 pointer-events-none'}`
                }`}
            >
                <div className="min-w-[16rem] border-b border-slate-100 px-4 py-4 lg:pt-5">
                    <button
                        type="button"
                        onClick={handleCompose}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                        <PenSquare className="h-4 w-4" />
                        Compose
                    </button>
                </div>

                <nav className="scrollbar-thin min-w-[16rem] flex-1 space-y-1 overflow-y-auto px-3 py-3">
                    {SIDEBAR_DATA.map((item) => {
                        const Icon = item.icon;
                        const active = type === item.name && !(item.name === 'allmail' && activeLabel);
                        const unread = Number(counts.system_unread?.[item.name] ?? (
                            item.name === 'inbox' ? counts.inbox_unread : 0
                        ));

                        return (
                            <NavLink
                                key={item.name}
                                to={`${routes.emails.path}/${item.name}`}
                                className={navClass({ isActive: active })}
                                onClick={handleNavigate}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                {unread > 0 && (
                                    <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                                        {unread}
                                    </span>
                                )}
                            </NavLink>
                        );
                    })}

                    <div className="pt-3">
                        <LabelSidebar
                            counts={counts.label_unread || {}}
                            onNavigate={handleNavigate}
                        />
                        <ContactSidebar onNavigate={handleNavigate} />
                    </div>
                </nav>

                <ComposeMail onSent={onSent} />
            </aside>
        </>
    );
};

export default Sidebar;
