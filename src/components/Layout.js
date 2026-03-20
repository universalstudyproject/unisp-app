import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";

export default function Layout({
  children,
  onLogoutClick,
  onAdminClick,
  onMembriClick,
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem("unisp_user");
    if (router.pathname !== "/" && !storedUser) {
      router.replace("/");
    }
  }, [router.pathname]);

  if (router.pathname === "/") {
    return <main>{children}</main>;
  }

  // Vérification des rôles
  const isAdmin = user?.tipologia_socio?.toUpperCase() === "ADMIN";
  const isStaff = isAdmin || user?.tipologia_socio?.toUpperCase() === "STAFF";

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-inter">
      <header className="p-6 flex justify-between items-center border-b border-white/5 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-[100]">
        <h1 className="text-lg font-black tracking-tighter text-white italic relative z-10">
          UNISP{" "}
          <span className="text-blue-500 font-light not-italic text-sm tracking-normal">
            SYSTEM
          </span>
        </h1>

        {menuOpen && (
          <div
            className="fixed inset-0 w-screen h-screen bg-slate-950/60 backdrop-blur-md z-[150] animate-in fade-in duration-300"
            style={{ top: 0, left: 0 }}
            onClick={() => setMenuOpen(false)}
          />
        )}

        <div className="relative z-[200]" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`flex items-center gap-2 text-[10px] font-black border border-white/10 px-4 py-2.5 rounded-xl uppercase tracking-widest transition-colors relative z-[200] ${menuOpen ? "bg-white/10 text-white shadow-lg shadow-white/5" : "text-slate-300 hover:bg-white/5"}`}
          >
            <div className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            {user?.nome || "Menu"}
            <svg
              className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180 text-blue-400" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-3 w-45 bg-[#0f172a] border border-slate-700 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 z-[200]">
              {" "}
              <div className="p-2 flex flex-col gap-1">
                {/* NOUVEAU BOUTON : MEMBRI (Uniquement pour le Staff/Admin) */}
                {isStaff && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (onMembriClick) onMembriClick();
                    }}
                    className="w-full text-left px-1 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors flex items-center gap-3"
                  >
                    {/* Icône de groupe d'utilisateurs */}
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                    Gestione Membri
                  </button>
                )}

                {/* BOUTON ADMIN */}
                {isAdmin && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (onAdminClick) onAdminClick();
                    }}
                    className="w-full text-left px-1 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    Pannello Admin
                  </button>
                )}

                {/* LIGNE DE SÉPARATION */}
                {isStaff && <div className="h-px w-full bg-white/5 my-1" />}

                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (onLogoutClick) {
                      onLogoutClick();
                    } else {
                      localStorage.removeItem("unisp_user");
                      localStorage.removeItem("active_tab");
                      window.location.href = "/";
                    }
                  }}
                  className="w-full text-left px-1 py-1 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-3"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Esci
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 pb-32 relative z-0">
        {children}
      </main>
    </div>
  );
}
