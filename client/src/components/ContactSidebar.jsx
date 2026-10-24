import { NavLink, useLocation } from 'react-router-dom';
import { routes } from '../routes/routes';
import MailshotIcon from './ui/MailshotIcon';

const ContactSidebar = ({ onNavigate }) => {
    const location = useLocation();
    const isActive = location.pathname === routes.contacts.path;

    return (
        <div className="mt-2 px-1">
            <NavLink
                to={routes.contacts.path}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                }`}
            >
                <MailshotIcon name="users" size={22} />
                Contacts
            </NavLink>
        </div>
    );
};

export default ContactSidebar;
