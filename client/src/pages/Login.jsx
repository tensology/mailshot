import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';

const Login = () => {
    const { login, isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = location.state?.from || '/emails/inbox';

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isLoading && isAuthenticated) {
        return <Navigate to={redirectTo} replace />;
    }

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            await login(username.trim(), password);
            navigate(redirectTo, { replace: true });
        } catch (requestError) {
            const message = typeof requestError?.response?.data === 'string'
                ? requestError.response.data
                : requestError?.message || 'Login failed';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-8">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                        <Mail className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900">Sign in to Mailshot</h1>
                        <p className="text-sm text-slate-500">Use your Mailshot account credentials</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        id="username"
                        label="Email"
                        type="email"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        required
                    />
                    <Input
                        id="password"
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                    />
                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? <Spinner size={18} className="border-white/30 border-t-white" /> : 'Sign in'}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default Login;
