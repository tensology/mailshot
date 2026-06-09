import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    CircularProgress
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

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
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f6f8fc',
                px: 2
            }}
        >
            <Paper
                elevation={0}
                sx={{
                    width: '100%',
                    maxWidth: 420,
                    p: 4,
                    borderRadius: 3,
                    border: '1px solid #dadce0'
                }}
            >
                <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 500 }}>
                    Sign in to Mailshot
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Use your Mailshot account credentials
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label="Email"
                        type="email"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        required
                        fullWidth
                    />
                    <TextField
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="current-password"
                        required
                        fullWidth
                    />
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={submitting}
                        sx={{ mt: 1, textTransform: 'none', py: 1.2 }}
                    >
                        {submitting ? <CircularProgress size={22} color="inherit" /> : 'Sign in'}
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default Login;
