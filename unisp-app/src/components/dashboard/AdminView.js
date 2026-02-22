import React from "react";

export default function AdminView({ 
  membres, 
  filter, 
  setFilter, 
  searchTerm, 
  setSearchTerm, 
  setSelectedMembre, 
  isAuthValid, 
  authorizeVolontaire, 
  revokeVolontaire 
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-white font-black text-2xl uppercase tracking-tighter">Membri</h1>
      
      <input
        type="text"
        placeholder="Cerca nome o cognome..."
        className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

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

      <div className="space-y-3 pb-24">
        {membres.map((m) => {
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
                
                {/* AREA DETTAGLI - Nome e Cognome */}
                <div className="cursor-pointer flex flex-col flex-grow" onClick={() => setSelectedMembre(m)}>
                  <span className="text-white font-light uppercase text-sm leading-tight">{m.nome}</span>
                  <span className="text-blue-500 font-black uppercase text-sm leading-tight">{m.cognome}</span>
                  {filter === "ALL" && <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">{m.tipologia_socio}</p>}
                </div>
                
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
        })}
      </div>
    </div>
  );
}