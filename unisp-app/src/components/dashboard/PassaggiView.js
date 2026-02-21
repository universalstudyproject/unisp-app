import React from "react";

export default function PassaggiView({ passaggi }) {
  return (
    <div className="space-y-3">
      {passaggi.length === 0 ? (
        <p className="text-center text-slate-600 py-10 italic">Nessun passaggio oggi</p>
      ) : (
        passaggi.map((p) => (
          <div key={p.id} className="glass p-4 rounded-2xl flex justify-between items-center border-l-4 border-blue-500 shadow-lg bg-white/5">
            <div className="flex flex-col">
              <span className="font-bold text-white text-sm">{p.membres?.nome} {p.membres?.cognome}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(p.scanned_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <span className="bg-blue-600 text-white text-[11px] px-3 py-1 rounded-lg font-black italic">N° {p.numero_giornaliero}</span>
          </div>
        ))
      )}
    </div>
  );
}