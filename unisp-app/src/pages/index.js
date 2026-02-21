import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const attemptLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const { data, error } = await supabase
      .from('membres')
      .select('*')
      .ilike('email', email.trim())
      .single();

    if (error || !data || data.password !== password) {
      alert("Identifiants incorrects");
      setLoading(false);
      return;
    }

    localStorage.setItem('unisp_user', JSON.stringify(data));
    router.push('/dashboard');
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a] z-[1000] flex items-center justify-center p-5">
      <div className="glass w-full max-w-sm p-8 rounded-[2.5rem] space-y-6 text-center shadow-2xl">
        <h1 className="text-2xl font-black italic text-white uppercase tracking-tighter">
          UNISP <span className="text-blue-500">PRO+</span>
        </h1>
        <p className="text-slate-400 text-sm">Veuillez vous connecter</p>
        
        <form onSubmit={attemptLogin} className="space-y-4">
          <input 
            type="email" 
            placeholder="Email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
          <input 
            type="password" 
            placeholder="Mot de passe" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors text-white uppercase tracking-widest"
          >
            {loading ? "VÉRIFICATION..." : "CONNEXION"}
          </button>
        </form>
      </div>
    </div>
  );
}