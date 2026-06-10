import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URLS } from '../services/api.urls';
import { API_URL } from '../config/env';

const TOKEN_KEY = 'mailshot_auth_token';

const AuthContext = createContext(null);

const buildAuthUrl = (endpoint) => `${API_URL}/${endpoint}`;

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    const clearSession = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken('');
        setUsername('');
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
            setUsername(response.data?.username || '');
            setIsLoading(false);
            return true;
        } catch {
            clearSession();
            setIsLoading(false);
            return false;
        }
    }, [clearSession]);

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
        setUsername(response.data?.username || loginUsername);
        return response.data;
    }, []);

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

    const value = useMemo(() => ({
        token,
        username,
        isAuthenticated: Boolean(token),
        isLoading,
        login,
        logout,
        restoreSession
    }), [token, username, isLoading, login, logout, restoreSession]);

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
