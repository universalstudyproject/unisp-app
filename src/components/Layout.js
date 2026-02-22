import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function Layout({ children }) {
  const router = useRouter();
  
  // 1. Inizializziamo l'utente leggendo dal localStorage solo se siamo sul client
  // Questo evita l'errore di idratazione senza bisogno di setMounted(true)
  const [user, setUser] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unisp_user");
      try {
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    // 2. Logica di reindirizzamento: se non siamo al login e non c'è l'utente, vai al login
    const storedUser = localStorage.getItem("unisp_user");
    
    if (router.pathname !== "/" && !storedUser) {
      router.replace("/");
    }
  }, [router.pathname]);

  // Se siamo nella pagina di login, restituiamo solo il contenuto
  if (router.pathname === "/") {
    return <main>{children}</main>;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-inter">
      <header className="p-6 flex justify-between items-center border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-[100]">
        <h1 className="text-lg font-black tracking-tighter text-white italic">
          UNISP <span className="text-blue-500 font-light not-italic text-sm tracking-normal">SYSTEM</span>
        </h1>
        <button
          onClick={() => {
            localStorage.removeItem("unisp_user");
            localStorage.removeItem("active_tab");
            window.location.href = "/";
          }}
          className="text-[10px] font-black text-red-500 border border-red-500/30 px-3 py-1.5 rounded-xl uppercase tracking-widest hover:bg-red-500/10 transition-colors"
        >
          Esci
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 pb-32">
        {children}
      </main>
    </div>
  );
}