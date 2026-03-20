import React, { useState, useEffect } from "react";
import Papa from "papaparse";

export default function AdminView({
  membres,
  filter,
  setFilter,
  searchTerm,
  setSearchTerm,
  setSelectedMembre,
  isAuthValid,
  authorizeVolontaire,
  revokeVolontaire,
  updateMembreField,
  createLog,
}) {
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // --- HELPER PER NOTIFICHE ---
  const showNotify = (title, message, type = "success") => {
    setNotification({ title, message, type });
    // Sparisce automaticamente dopo 4 secondi
    setTimeout(() => setNotification(null), 4000);
  };

  // --- LOGICA DI IMPORTAZIONE ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const response = await fetch("/api/import-members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: results.data }),
          });

          const data = await response.json();

          if (data.success) {
            await createLog(
              "IMPORT_CSV",
              `Importazione completata: ${data.imported} nuovi membri. Nome file: ${file.name}`,
            );

            showNotify(
              "Importazione Riuscita",
              `Inseriti ${data.imported} membri.`,
              "success",
            );

            // Aggiornamento fluido senza reload selvaggio
            setTimeout(() => {
              // Qui potresti chiamare una funzione fetchMembres() se passata come prop
              // window.location.reload(); // Solo se strettamente necessario
            }, 3000);
          } else {
            showNotify("Errore Importazione", data.message, "error");
          }
        } catch (error) {
          console.error("Errore API Import:", error);
          showNotify(
            "Errore connessione",
            "Impossibile contattare il server.",
            "error",
          );
        } finally {
          setIsImporting(false);
          e.target.value = "";
        }
      },
    });
  };

  return (
    <div className="space-y-6 relative">
      {/* NOTIFICA TOAST CUSTOM */}
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm animate-in slide-in-from-top-4 duration-500">
          <div
            className={`glass p-4 rounded-3xl border ${notification.type === "success" ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"} backdrop-blur-2xl shadow-2xl flex items-center gap-4`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notification.type === "success" ? "bg-emerald-500" : "bg-red-500"}`}
            >
              {notification.type === "success" ? (
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <span className="text-white font-black">!</span>
              )}
            </div>
            <div>
              <p className="text-white font-black text-xs uppercase tracking-tighter">
                {notification.title}
              </p>
              <p className="text-slate-400 text-[10px] leading-tight mt-0.5">
                {notification.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. HEADER: TITOLO */}
      <div className="flex justify-between items-end px-2 mb-2">
        <div>
          <h2 className="text-blue-400 font-black text-lg uppercase tracking-tighter">
            Gestione Membri
          </h2>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">
            <span className="text-blue-400">{membres.length}</span> risultati
            trovati
          </p>
        </div>
      </div>

      {/* 2. BARRA DI RICERCA + DROPDOWN CUSTOM FILTRI */}
      <div className="flex gap-2 relative z-20">
        {/* Barra di ricerca */}
        <div className="relative grow">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg
              className="w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Cerca nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-full bg-slate-900/50 border border-white/10 rounded-2xl pl-10 pr-4 py-3.5 text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-all font-bold text-sm shadow-inner"
          />
        </div>

        {/* Dropdown Custom (Menu a tendina) */}
        <div className="relative shrink-0">
          <button
            onClick={() => setFilterMenuOpen(!filterMenuOpen)}
            className={`h-full flex items-center justify-between gap-3 bg-slate-900 border ${
              filterMenuOpen
                ? "border-blue-500 text-white shadow-lg shadow-white/5"
                : "border-white/10 text-slate-300 hover:bg-white/5"
            } text-[10px] font-black uppercase tracking-widest rounded-xl pl-5 pr-4 py-3.5 transition-all relative z-[200] active:scale-95`}
          >
            {filter === "ALL"
              ? "Tutti"
              : filter === "STAFF"
                ? "Staff"
                : filter === "VOLONTARIO"
                  ? "Volontari"
                  : "Accessi"}
            <svg
              className={`w-3 h-3 transition-transform ${filterMenuOpen ? "rotate-180 text-blue-400" : ""}`}
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

          {/* Il Menu aperto - DESIGN IDENTICO AL LAYOUT */}
          {filterMenuOpen && (
            <>
              {/* Sfondo invisibile per chiudere cliccando fuori */}
              <div
                className="fixed inset-0 z-[150] bg-slate-950/20"
                onClick={() => setFilterMenuOpen(false)}
              ></div>

              {/* Contenitore del menu (Z-index altissimo, sfondo solido come layout) */}
              <div className="absolute right-0 mt-3 w-44 bg-[#0f172a] border border-slate-700 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 z-[200]">
                <div className="p-2 flex flex-col gap-1">
                  {[
                    { val: "ALL", label: "Tutti" },
                    { val: "STAFF", label: "Staff" },
                    { val: "VOLONTARIO", label: "Volontari" },
                    { val: "ACCESSI", label: "Accessi" },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => {
                        setFilter(opt.val);
                        setFilterMenuOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors flex items-center gap-3 ${
                        filter === opt.val
                          ? "text-gray-500"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {/* Petit indicateur visuel (optionnel, pour le style) */}
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${filter === opt.val ? "bg-gray-500" : "bg-transparent"}`}
                      ></div>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* LISTA MEMBRI */}
      <div className="space-y-3 pb-24">
        {membres.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-600 font-black uppercase text-[10px] tracking-[0.2em]">
              Nessun Risultato
            </p>
          </div>
        ) : (
          membres.map((m) => {
            const s = m.stato?.toUpperCase() || "INATTIVO";
            const hasAuth = isAuthValid(m);
            const isCompactMode =
              filter === "VOLONTARIO" || filter === "ACCESSI";

            let bStyle = "bg-red-500/10 text-red-400 border-red-500/20";
            let dotColor = "bg-red-500";
            if (s === "ATTIVO") {
              bStyle =
                "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              dotColor = "bg-emerald-500";
            } else if (s === "SOSPESO") {
              bStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              dotColor = "bg-amber-500";
            } else if (s === "ESCLUSO") {
              bStyle = "bg-gray-500/10 text-gray-400 border-gray-500/20";
              dotColor = "bg-gray-500";
            }

            return (
              <div
                key={m.id}
                className="glass p-5 rounded-[2rem] bg-white/5 transition-all active:scale-[0.98] "
              >
                <div className="flex justify-between items-center">
                  <div
                    className="cursor-pointer flex flex-col flex-grow"
                    onClick={() => setSelectedMembre(m)}
                  >
                    <span className="text-white font-light uppercase text-sm leading-tight tracking-tight">
                      {m.nome}
                    </span>
                    <span className="text-blue-500 font-black uppercase text-sm leading-tight">
                      {m.cognome}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">
                        {m.tipologia_socio}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isCompactMode && s === "ATTIVO" ? (
                      <button
                        onClick={() =>
                          hasAuth
                            ? revokeVolontaire(m.id)
                            : authorizeVolontaire(m.id)
                        }
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          hasAuth
                            ? "bg-red-500/20 text-red-500 border border-red-500/30 shadow-lg shadow-red-500/20"
                            : "bg-blue-600 text-white border border-blue-500 shadow-lg shadow-blue-600/30"
                        }`}
                      >
                        {hasAuth ? "REVOCA" : "SCAN"}
                      </button>
                    ) : (
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bStyle} backdrop-blur-md`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotColor}`}
                        ></span>
                        <span className="text-[10px] font-black uppercase leading-none">
                          {s}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="fixed bottom-28 right-11 z-[100] flex flex-col items-center">
        <label
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xl border border-white/10 ${
            isImporting
              ? "bg-slate-700"
              : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40"
          }`}
        >
          {isImporting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          )}
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isImporting}
          />
        </label>
        
      </div>
    </div>
  );
}
