import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import MailshotIcon from './ui/MailshotIcon';

const ChangePasswordDialog = () => {
    const { mustChangePassword, changePassword } = useAuth();
    const [dismissed, setDismissed] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (mustChangePassword) {
            setDismissed(false);
        }
    }, [mustChangePassword]);

    if (!mustChangePassword || dismissed) {
        return null;
    }

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        if (newPassword.length < 6) {
            setError('Choose a password of at least 6 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('The two passwords do not match');
            return;
        }
        setSaving(true);
        try {
            await changePassword(newPassword, confirmPassword);
            setNewPassword('');
            setConfirmPassword('');
            setDismissed(true);
        } catch (err) {
            const detail = err?.response?.data;
            setError(typeof detail === 'string' ? detail : 'Could not update the password');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
            <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl">
                <div className="mb-2 flex items-center gap-2">
                    <MailshotIcon name="settings" size={22} />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Choose a new password</h2>
                </div>
                <p className="mb-4 text-sm leading-5 text-slate-600 dark:text-slate-300">
                    You are signed in with a temporary password. Set your own password to keep your mailbox secure.
                </p>
                <label className="mb-3 block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">New password</span>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        autoFocus
                        className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                </label>
                <label className="mb-3 block">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm password</span>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900"
                    />
                </label>
                {error && <p className="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="rounded-md px-3 py-2 text-sm text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        Not now
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                        {saving ? 'Saving…' : 'Save password'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ChangePasswordDialog;
