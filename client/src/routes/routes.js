import { lazy } from 'react';

const Main = lazy(() => import('../pages/Main'));
const Emails = lazy(() => import('../components/Emails'));
const ViewEmail = lazy(() => import('../components/ViewEmail'));
const Contacts = lazy(() => import('../components/Contacts'));

const routes = {
    main: {
        path: '/',
        element: Main
    },
    emails: {
        path: '/emails',
        element: Emails
    },
    contacts: {
        path: '/contacts',
        element: Contacts
    },
    invalid: {
        path: '/*',
        element: Emails
    },
    view: {
        path: '/emails/:type/:id',
        element: ViewEmail
    }
};

export { routes };
