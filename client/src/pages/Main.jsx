import { useState, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import SuspenseLoader from '../components/common/SuspenseLoader';
import { LayoutProvider } from '../context/LayoutContext';

const Main = () => {
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <LayoutProvider>
            <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-50">
                <Header />
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <Sidebar onSent={() => setRefreshKey((value) => value + 1)} />
                    <main className="min-w-0 flex-1 overflow-hidden">
                        <Suspense fallback={<SuspenseLoader />}>
                            <Outlet context={{ refreshKey }} />
                        </Suspense>
                    </main>
                </div>
            </div>
        </LayoutProvider>
    );
};

export default Main;
