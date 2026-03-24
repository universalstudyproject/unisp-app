import React from "react";

export default function PassaggiView({ passaggi }) {
  return (
    <div className="space-y-3 pb-24">
      {passaggi.length === 0 ? (
        <p className="text-center text-slate-600 py-10 italic uppercase text-[10px] tracking-widest font-black">
          Nessuna prenotazione oggi
        </p>
      ) : (
        passaggi.map((p) => (
          <div
            key={p.id}
            className="glass p-5 rounded-[2rem] flex justify-between items-center border border-white/5 shadow-xl bg-white/5 animate-in slide-in-from-left duration-300"
          >
            <div className="flex flex-col gap-0.5">
              {/* NOME E COGNOME SU DUE RIGHE CON FALLBACK (Sécurité) */}
              <span className="text-white font-light uppercase text-xs leading-none">
                {p.membres?.nome || "Utente"}
              </span>
              <span
                className={`${p.membres ? "text-blue-500" : "text-slate-500"} font-black uppercase text-sm leading-tight`}
              >
                {p.membres?.cognome || "Eliminato"}
              </span>
            </div>

            {/* NUMERO GIORNALIERO DESIGN "PILL" */}
            <div className="flex flex-col items-center gap-1">
              <span
                className={`text-white text-sm px-2.5 py-0.5 rounded-xl font-black shadow-md min-w-[35px] text-center leading-tight ${
                  p.membres?.tipologia_socio?.toUpperCase() === "PASSIVO"
                    ? "bg-blue-600 shadow-blue-600/20"
                    : "bg-green-600 shadow-green-600/20"
                }`}
              >
                {p.numero_giornaliero}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
