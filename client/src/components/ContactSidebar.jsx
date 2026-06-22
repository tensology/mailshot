import { NavLink, useLocation } from 'react-router-dom';
import { Users } from 'lucide-react';
import { routes } from '../routes/routes';

const ContactSidebar = ({ onNavigate }) => {
    const location = useLocation();
    const isActive = location.pathname === routes.contacts.path;

    return (
        <div className="mt-2 px-1">
            <NavLink
                to={routes.contacts.path}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                }`}
            >
                <Users className="h-4 w-4" />
                Contacts
            </NavLink>
        </div>
    );
};

export default ContactSidebar;
