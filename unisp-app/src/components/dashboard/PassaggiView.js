import React from "react";

export default function PassaggiView({ passaggi }) {
  return (
    <div className="space-y-3 pb-24">
      {passaggi.length === 0 ? (
        <p className="text-center text-slate-600 py-10 italic uppercase text-[10px] tracking-widest font-black">
          Nessun passaggio oggi
        </p>
      ) : (
        passaggi.map((p) => (
          <div 
            key={p.id} 
            className="glass p-5 rounded-[2rem] flex justify-between items-center border border-white/5 shadow-xl bg-white/5 animate-in slide-in-from-left duration-300"
          >
            <div className="flex flex-col gap-0.5">
              {/* NOME E COGNOME SU DUE RIGHE */}
              <span className="text-white font-light uppercase text-xs leading-none">
                {p.membres?.nome}
              </span>
              <span className="text-blue-500 font-black uppercase text-sm leading-tight">
                {p.membres?.cognome}
              </span>
              
              {/* ORARIO SOTTO */}
              <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter mt-1">
                Registrato alle: {new Date(p.scanned_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            {/* NUMERO GIORNALIERO DESIGN "PILL" */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">N°</span>
              <span className="bg-blue-600 text-white text-lg px-4 py-1 rounded-2xl font-black shadow-lg shadow-blue-600/30 min-w-[50px] text-center">
                {p.numero_giornaliero}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}