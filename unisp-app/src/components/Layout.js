import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
    const router = useRouter();
    const [user, setUser] = useState(null);

    useEffect(() => {
        const loadUser = () => {
            const storedUser = localStorage.getItem('unisp_user');
            if (storedUser) {
                try {
                    setUser(JSON.parse(storedUser));
                } catch (e) {
                    console.error("Errore parsing user", e);
                }
            }
        };
        loadUser();
    }, [router.pathname]);

    const logout = () => {
        localStorage.removeItem('unisp_user');
        localStorage.removeItem('active_tab');
        router.push('/');
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100 font-inter">
            <header className="p-6 flex justify-between items-center border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-[100]">
                {/* LOGO */}
                <h1 className="text-lg font-black tracking-tighter text-white italic">
                    UNISP <span className="text-blue-500 font-light not-italic text-sm tracking-normal">PRO+</span>
                </h1>

                {/* BOTTONE ESCI */}
                <button
                    onClick={logout}
                    className="text-[10px] font-black text-red-500 border border-red-500/30 px-3 py-1.5 rounded-xl uppercase tracking-widest hover:bg-red-500/10 transition-colors"
                >
                    Esci
                </button>
            </header>

            <main className="max-w-md mx-auto px-4 pt-6 pb-32">
                {children}
            </main>

            {/* Pulsante flottante scanner (mostrato solo se non siamo già in dashboard con lo scanner aperto) */}
            {router.pathname !== '/dashboard' && (
                <button
                    onClick={() => router.push('/dashboard?autoStart=true')}
                    className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_30px_-5px_rgba(37,99,235,0.5)] active:scale-90 transition-all z-50 border border-white/10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </button>
            )}
        </div>
    );
}