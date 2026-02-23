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
  triggerAutoEmail,
}) {
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState(null);

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
              `Importazione completata: ${data.imported} nuovi membri. Nome file: ${file.name}`
            );

            if (data.imported > 0) {
              triggerAutoEmail(data.imported);
            }

            showNotify(
              "Importazione Riuscita",
              `Inseriti ${data.imported} membri. QR Code in fase di invio...`,
              "success"
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
          showNotify("Errore connessione", "Impossibile contattare il server.", "error");
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
          <div className={`glass p-4 rounded-3xl border ${notification.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'} backdrop-blur-2xl shadow-2xl flex items-center gap-4`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {notification.type === 'success' ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <span className="text-white font-black">!</span>
              )}
            </div>
            <div>
              <p className="text-white font-black text-xs uppercase tracking-tighter">{notification.title}</p>
              <p className="text-slate-400 text-[10px] leading-tight mt-0.5">{notification.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* HEADER CON RICERCA E IMPORT */}
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Cerca nome o cognome..."
          className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {/* PULSANTE IMPORTA CSV */}
        <label
          className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer ${
            isImporting
              ? "bg-slate-700 text-slate-400"
              : "bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-500 active:scale-95"
          }`}
        >
          {isImporting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          <span className="text-[11px]">
            {isImporting ? "Elaborazione..." : "Importa Membri CSV"}
          </span>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={isImporting} />
        </label>
      </div>

      {/* FILTRI TABS */}
      <div className="grid grid-cols-2 gap-2">
        {["ALL", "STAFF", "VOLONTARIO", "ACCESSI"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
              filter === f
                ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30"
                : "bg-white/5 border-white/10 text-slate-400"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* LISTA MEMBRI */}
      <div className="space-y-3 pb-24">
        {membres.length === 0 ? (
          <div className="text-center py-10">
             <p className="text-slate-600 font-black uppercase text-[10px] tracking-[0.2em]">Nessun Risultato</p>
          </div>
        ) : (
          membres.map((m) => {
            const s = m.stato?.toUpperCase() || "INATTIVO";
            const hasAuth = isAuthValid(m);
            const isCompactMode = filter === "VOLONTARIO" || filter === "ACCESSI";

            let bStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
            let dotColor = "bg-blue-500";
            if (s === "ATTIVO") {
              bStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              dotColor = "bg-emerald-500";
            } else if (s === "SOSPESO") {
              bStyle = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              dotColor = "bg-amber-500";
            } else if (s === "ESCLUSO") {
              bStyle = "bg-red-500/10 text-red-400 border-red-500/20";
              dotColor = "bg-red-500";
            }

            return (
              <div
                key={m.id}
                className="glass p-5 rounded-[2rem] border border-white/5 shadow-xl bg-white/5 transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-center">
                  <div className="cursor-pointer flex flex-col flex-grow" onClick={() => setSelectedMembre(m)}>
                    <span className="text-white font-light uppercase text-sm leading-tight tracking-tight">{m.nome}</span>
                    <span className="text-blue-500 font-black uppercase text-sm leading-tight">{m.cognome}</span>
                    <div className="flex items-center gap-2 mt-1">
                       <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{m.tipologia_socio}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isCompactMode && s === "ATTIVO" ? (
                      <button
                        onClick={() => hasAuth ? revokeVolontaire(m.id) : authorizeVolontaire(m.id)}
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          hasAuth
                            ? "bg-red-500/20 text-red-500 border border-red-500/30 shadow-lg shadow-red-500/20"
                            : "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        }`}
                      >
                        {hasAuth ? "REVOCA" : "SCAN"}
                      </button>
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bStyle} backdrop-blur-md`}>
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotColor}`}></span>
                        <span className="text-[10px] font-black uppercase leading-none">{s}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}