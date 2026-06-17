import { Suspense, lazy } from 'react';
import { Navigate, Route, createBrowserRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom';
import { routes } from './routes/routes';
import SuspenseLoader from './components/common/SuspenseLoader';
import DataProvider from './context/DataProvider';
import { ComposeProvider } from './context/ComposeContext';
import { AuthProvider } from './context/AuthContext';
import { ReadSummaryProvider } from './context/ReadSummaryContext';
import { UndoDeleteProvider } from './context/UndoDeleteContext';
import ProtectedRoute from './components/ProtectedRoute';

const ErrorComponent = lazy(() => import('./components/common/ErrorComponent'));
const Login = lazy(() => import('./pages/Login'));
const Main = routes.main.element;

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route>
            <Route path="/login" element={<Login />} />
            <Route path={routes.main.path} element={<Navigate to={`${routes.emails.path}/inbox`} />} />
            <Route
                path={routes.main.path}
                element={(
                    <ProtectedRoute>
                        <Main />
                    </ProtectedRoute>
                )}
            >
                <Route path={`${routes.emails.path}/:type`} element={<routes.emails.element />} errorElement={<ErrorComponent />} />
                <Route path={routes.view.path} element={<routes.view.element />} errorElement={<ErrorComponent />} />
                <Route path={routes.contacts.path} element={<routes.contacts.element />} errorElement={<ErrorComponent />} />
            </Route>

            <Route path={routes.invalid.path} element={<Navigate to={`${routes.emails.path}/inbox`} />} />
        </Route>
    )
);

function App() {
    return (
        <Suspense fallback={<SuspenseLoader />}>
            <AuthProvider>
                <DataProvider>
                    <ComposeProvider>
                        <ReadSummaryProvider>
                            <UndoDeleteProvider>
                                <RouterProvider router={router} />
                            </UndoDeleteProvider>
                        </ReadSummaryProvider>
                    </ComposeProvider>
                </DataProvider>
            </AuthProvider>
        </Suspense>
    );
}

export default App;
