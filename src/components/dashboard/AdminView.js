import React, { useState } from "react";
import Papa from 'papaparse';

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
  updateMembreField 
}) {
  const [isImporting, setIsImporting] = useState(false);

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
          const response = await fetch('/api/import-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: results.data }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            alert(`✅ Importazione completata!\n\n- Nuovi membri inseriti: ${data.imported}\n- Duplicati (CF già presenti) saltati: ${data.skipped}`);
            // Ricarica la pagina per vedere i nuovi membri
            window.location.reload();
          } else {
            alert("❌ Errore durante l'importazione: " + data.message);
          }
        } catch (error) {
          console.error("Errore API Import:", error);
          alert("❌ Errore di connessione al server.");
        } finally {
          setIsImporting(false);
          e.target.value = ""; // Resetta l'input file
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER CON RICERCA E IMPORT */}
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Cerca nome o cognome..."
          className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {/* PULSANTE IMPORTA CSV */}
        <label className={`flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer ${isImporting ? 'bg-slate-700 text-slate-400' : 'bg-green-600 text-white shadow-green-600/20 hover:bg-green-500 active:scale-95'}`}>
          {isImporting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          <span>{isImporting ? 'Importazione in corso...' : 'Importa Membri CSV'}</span>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={isImporting} />
        </label>
      </div>

      {/* FILTRI TABS */}
      <div className="grid grid-cols-2 gap-2">
        {["ALL", "STAFF", "VOLONTARIO", "ACCESSI"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${filter === f ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30" : "bg-white/5 border-white/10 text-slate-400"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* LISTA MEMBRI */}
      <div className="space-y-3 pb-24">
        {membres.length === 0 ? (
          <p className="text-center text-slate-500 py-10 font-bold uppercase text-xs tracking-widest">Nessun membro trovato</p>
        ) : (
          membres.map((m) => {
            const s = m.stato?.toUpperCase() || "INATTIVO";
            const hasAuth = isAuthValid(m);
            const isCompactMode = filter === "VOLONTARIO" || filter === "ACCESSI";

            let bStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
            let dotColor = "bg-blue-500";
            if (s === "ATTIVO") { bStyle = "bg-green-500/10 text-green-400 border-green-500/20"; dotColor = "bg-green-500"; }
            else if (s === "SOSPESO") { bStyle = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"; dotColor = "bg-yellow-500"; }
            else if (s === "ESCLUSO") { bStyle = "bg-red-500/10 text-red-400 border-red-500/20"; dotColor = "bg-red-500"; }

            return (
              <div key={m.id} className="glass p-5 rounded-[2rem] border border-white/5 shadow-xl bg-white/5 transition-all active:scale-[0.98]">
                <div className="flex justify-between items-center">
                  
                  {/* AREA DETTAGLI */}
                  <div className="cursor-pointer flex flex-col flex-grow" onClick={() => setSelectedMembre(m)}>
                    <span className="text-white font-light uppercase text-sm leading-tight">{m.nome}</span>
                    <span className="text-blue-500 font-black uppercase text-sm leading-tight">{m.cognome}</span>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">
                      {m.tipologia_socio} • {m.cf}
                    </p>
                  </div>
                  
                  {/* AZIONI / STATO */}
                  <div className="flex items-center gap-3">
                    {isCompactMode && s === "ATTIVO" ? (
                      <button
                        onClick={() => hasAuth ? revokeVolontaire(m.id) : authorizeVolontaire(m.id)}
                        className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hasAuth ? 'bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_15px_-5px_rgba(239,68,68,0.5)]' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'}`}
                      >
                        {hasAuth ? 'REVOCA' : 'SCAN'}
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