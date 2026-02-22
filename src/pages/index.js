import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const router = useRouter();

  // Inizializzazione basata su localStorage per evitare sfarfallii
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("unisp_user");
    if (storedUser) {
      router.replace("/dashboard");
    } else {
      setIsChecking(false);
    }
  }, [router]);

  const attemptLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data, error: dbError } = await supabase
        .from("membres")
        .select("*")
        .ilike("email", email.trim())
        .single();

      if (dbError || !data || data.password !== password) {
        throw new Error("Credenziali non valide");
      }

      localStorage.setItem("unisp_user", JSON.stringify(data));
      router.replace("/dashboard");
    } catch (err) {
      setError(err.message);
      setIsShaking(true);
      setLoading(false);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  // Se stiamo controllando la sessione, mostriamo solo lo sfondo blu
  if (isChecking) return <div className="min-h-screen bg-[#0f172a]" />;

  return (
    <div className="fixed inset-0 bg-[#0f172a] z-[1000] flex items-center justify-center p-5">
      <div
        className={`glass w-full max-w-sm p-8 rounded-[2.5rem] space-y-6 text-center shadow-2xl transition-all duration-300 ${isShaking ? "animate-shake" : ""}`}
      >
        <h1 className="text-2xl font-black italic text-white uppercase tracking-tighter">
          UNISP <span className="text-blue-500 font-light">SYSTEM</span>
        </h1>

        <p className="text-slate-400 text-sm italic">Effettua l&apos;accesso</p>

        <form onSubmit={attemptLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-500"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-500"
            required
          />

          <div
            className={`overflow-hidden transition-all duration-300 ${error ? "max-h-12 opacity-100" : "max-h-0 opacity-0"}`}
          >
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

      <style jsx>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-6px);
          }
          75% {
            transform: translateX(6px);
          }
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
