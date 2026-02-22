import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); // Stato per il messaggio di errore
  const [isShaking, setIsShaking] = useState(false); // Stato per l'animazione di errore
  const router = useRouter();

  const attemptLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(""); // Reset dell'errore ad ogni tentativo

    const { data, error: dbError } = await supabase
      .from('membres')
      .select('*')
      .ilike('email', email.trim())
      .single();

    // Logica di controllo: se c'è un errore, se l'utente non esiste o la password è errata
    if (dbError || !data || data.password !== password) {
      setError("Credenziali non valide");
      setIsShaking(true);
      setLoading(false);
      
      // Rimuove l'effetto vibrazione dopo 500ms
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    // Salvataggio utente in locale e reindirizzamento
    localStorage.setItem('unisp_user', JSON.stringify(data));
    router.replace('/dashboard');
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] z-[1000] flex items-center justify-center p-5">
      {/* Container principale con animazione condizionale 'animate-shake' */}
      <div className={`glass w-full max-w-sm p-8 rounded-[2.5rem] space-y-6 text-center shadow-2xl transition-all duration-300 ${isShaking ? 'animate-shake' : ''}`}>
        
        <h1 className="text-2xl font-black italic text-white uppercase tracking-tighter">
          UNISP <span className="text-blue-500 font-light">SYSTEM</span>
        </h1>
        
        <p className="text-slate-400 text-sm italic">Effettua l&apos;accesso</p>
        
        <form onSubmit={attemptLogin} className="space-y-4">
          <input 
            type="email" 
            placeholder="Email" 
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-500"
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-500"
            required
          />

          {/* MESSAGGIO DI ERRORE CUSTOM (Sostituisce l'alert) */}
          <div className={`overflow-hidden transition-all duration-300 ${error ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="bg-red-500/10 border border-red-500/20 py-2 rounded-xl">
              <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                ⚠️ {error}
              </p>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 py-4 rounded-xl font-bold hover:bg-blue-700 transition-all text-white uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
          >
            {loading ? "VERIFICA IN CORSO..." : "ACCEDI"}
          </button>
        </form>
      </div>

      {/* CSS PER L'ANIMAZIONE DI VIBRAZIONE E EFFETTO GLASS */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.15s ease-in-out 0s 2;
          border-color: rgba(239, 68, 68, 0.5) !important;
        }
        .glass {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  );
}