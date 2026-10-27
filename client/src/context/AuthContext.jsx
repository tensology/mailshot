import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';

const TOKEN_KEY = 'mailshot_auth_token';
const ACCOUNT_KEY = 'mailshot_account_id';

const AuthContext = createContext(null);

const buildAuthUrl = (endpoint) => `${API_URL}/${endpoint}`;

const pickActiveAccountId = (accounts = [], preferred = '') => {
    if (accounts.some((account) => account.id === preferred)) {
        return preferred;
    }
    return accounts[0]?.id || '';
};

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
    const [username, setUsername] = useState('');
    const [isSuperuser, setIsSuperuser] = useState(false);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [activeAccountId, setActiveAccountId] = useState(() => localStorage.getItem(ACCOUNT_KEY) || '');
    const [isLoading, setIsLoading] = useState(true);

    const applySession = useCallback((data, fallbackUsername = '') => {
        const nextAccounts = Array.isArray(data?.accounts) ? data.accounts : [];
        const preferred = localStorage.getItem(ACCOUNT_KEY) || data?.default_account_id || '';
        const nextActive = pickActiveAccountId(nextAccounts, preferred);
        setUsername(data?.username || fallbackUsername);
        setIsSuperuser(Boolean(data?.is_superuser));
        setMustChangePassword(Boolean(data?.must_change_password));
        setAccounts(nextAccounts);
        setActiveAccountId(nextActive);
        if (nextActive) {
            localStorage.setItem(ACCOUNT_KEY, nextActive);
        }
    }, []);

    const clearSession = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ACCOUNT_KEY);
        setToken('');
        setUsername('');
        setIsSuperuser(false);
        setMustChangePassword(false);
        setAccounts([]);
        setActiveAccountId('');
    }, []);

    const restoreSession = useCallback(async () => {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (!storedToken) {
            setIsLoading(false);
            return false;
        }

        try {
            const response = await axios.get(buildAuthUrl(API_URLS.authMe.endpoint), {
                headers: {
                    Authorization: `Bearer ${storedToken}`,
                    Accept: 'application/json'
                }
            });

            setToken(storedToken);
            applySession(response.data);
            setIsLoading(false);
            return true;
        } catch (error) {
            if (error?.response?.status === 401) {
                clearSession();
            } else {
                setToken(storedToken);
            }
            setIsLoading(false);
            return false;
        }
    }, [applySession, clearSession]);

    useEffect(() => {
        restoreSession();
    }, [restoreSession]);

    const login = useCallback(async (loginUsername, loginPassword) => {
        const response = await axios.post(
            buildAuthUrl(API_URLS.authLogin.endpoint),
            {
                username: loginUsername,
                password: loginPassword
            },
            { headers: { Accept: 'application/json' } }
        );

        const nextToken = response.data?.token;
        if (!nextToken) {
            throw new Error('Login failed');
        }

        localStorage.setItem(TOKEN_KEY, nextToken);
        setToken(nextToken);
        applySession(response.data, loginUsername);
        return response.data;
    }, [applySession]);

    const logout = useCallback(async () => {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (storedToken) {
            try {
                await axios.post(
                    buildAuthUrl(API_URLS.authLogout.endpoint),
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${storedToken}`,
                            Accept: 'application/json'
                        }
                    }
                );
            } catch {
                // ignore logout errors
            }
        }

        clearSession();
    }, [clearSession]);

    const changePassword = useCallback(async (newPassword, confirmPassword) => {
        const storedToken = localStorage.getItem(TOKEN_KEY);
        await axios.post(
            buildAuthUrl(API_URLS.changePassword.endpoint),
            { new_password: newPassword, confirm_password: confirmPassword },
            { headers: { Authorization: `Bearer ${storedToken}`, Accept: 'application/json' } }
        );
        setMustChangePassword(false);
    }, []);

    // Switching account swaps the entire dataset (mail, labels, contacts,
    // settings). A reload guarantees every view refetches under the new account.
    const switchAccount = useCallback((accountId) => {
        if (!accountId || accountId === activeAccountId) {
            return;
        }
        localStorage.setItem(ACCOUNT_KEY, accountId);
        setActiveAccountId(accountId);
        window.location.reload();
    }, [activeAccountId]);

    const value = useMemo(() => {
        const activeAccount = accounts.find((account) => account.id === activeAccountId) || null;
        return {
            token,
            username,
            isSuperuser,
            mustChangePassword,
            accounts,
            activeAccount,
            activeAccountId,
            hasMultipleAccounts: accounts.length > 1,
            isAuthenticated: Boolean(token),
            isLoading,
            login,
            logout,
            restoreSession,
            changePassword,
            switchAccount
        };
    }, [token, username, isSuperuser, mustChangePassword, accounts, activeAccountId, isLoading, login, logout, restoreSession, changePassword, switchAccount]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY) || '';

export const clearAuthToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

export const getActiveAccountId = () => localStorage.getItem(ACCOUNT_KEY) || '';
