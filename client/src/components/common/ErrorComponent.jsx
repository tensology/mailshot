import { useRouteError } from 'react-router-dom';
import Button from '../ui/Button';

const ErrorComponent = () => {
    const error = useRouteError();
    const message = error?.message || 'Something went wrong loading this page.';

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 className="text-xl font-semibold text-slate-900">Page error</h1>
            <p className="max-w-lg text-sm text-slate-600">{message}</p>
            <Button variant="secondary" onClick={() => window.location.assign('/emails/inbox')}>
                Back to inbox
            </Button>
        </div>
    );
};

export default ErrorComponent;
