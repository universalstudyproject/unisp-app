import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, RadarChart, PolarGrid,
  PolarAngleAxis, Radar, Legend, CartesianGrid,
} from "recharts";

export default function StatsView({
  membres,
  passaggi,
  alimentiData = [],
  setAlimenti,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [importStats, setImportStats] = useState({ date: "", count: 0 });

  // --- 1. TREND PRESENZE (Area Chart) ---
  const dataAffluenza = useMemo(() => {
    const perData = passaggi.reduce((acc, p) => {
      const d = new Date(p.scanned_at).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "2-digit",
      });
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(perData)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const [dA, mA] = a.date.split("/");
        const [dB, mB] = b.date.split("/");
        return new Date(2026, mA - 1, dA) - new Date(2026, mB - 1, dB);
      });
  }, [passaggi]);

  // --- 2. DISTRIBUZIONE STATI (Pie Chart) ---
  const dataStati = useMemo(() => {
    const counts = membres.reduce((acc, m) => {
      const s = m.stato?.charAt(0).toUpperCase() + m.stato?.slice(1).toLowerCase() || "Inattivo";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return [
      { name: "Attivo", value: counts["Attivo"] || 0, color: "#10b981" },
      { name: "Sospeso", value: counts["Sospeso"] || 0, color: "#f59e0b" },
      { name: "Inattivo", value: counts["Inattivo"] || 0, color: "#64748b" },
      { name: "Escluso", value: counts["Escluso"] || 0, color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [membres]);

  // --- 3. TIPOLOGIA SOCI (Bar Chart Orizzontale) ---
  const dataTipi = useMemo(() => {
    const counts = membres.reduce((acc, m) => {
      const t = m.tipologia_socio?.toUpperCase() || "PASSIVO";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    return ["STAFF", "VOLONTARIO", "ADMIN", "PASSIVO"].map((t) => ({
      name: t,
      value: counts[t] || 0,
    }));
  }, [membres]);

  // --- 4. STUDENTI VS NON STUDENTI (Donut Chart) ---
  const dataStudenti = useMemo(() => {
    const si = membres.filter(
      (m) =>
        m.is_studente?.toString().toUpperCase() === "SI" ||
        m.is_studente === true ||
        m.is_studente === "true"
    ).length;
    const no = membres.length - si;
    return [
      { name: "Studenti", value: si, color: "#8b5cf6" },
      { name: "Non Studenti", value: no, color: "#334155" },
    ];
  }, [membres]);

  // --- 5. RICORRENZA ALIMENTI (Radar Chart) ---
  const dataAlimentiRadar = useMemo(() => {
    const counts = alimentiData.reduce((acc, item) => {
      const n = item.prodotto?.toUpperCase().trim();
      if (n) acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, freq]) => ({ name, freq }))
      .sort((a, b) => b.freq - a.freq)
      .slice(0, 6);
  }, [alimentiData]);

  // --- 6. LOGICA ASSENZE CRITICHE ---
  const totaleAttivita = dataAffluenza.length;
  const inRischio = useMemo(() => {
    return membres
      .map((m) => {
        const presenze = new Set(
          passaggi
            .filter((p) => p.membre_id === m.id)
            .map((p) => new Date(p.scanned_at).toLocaleDateString())
        ).size;
        return {
          nome: `${m.nome} ${m.cognome}`,
          assenze: totaleAttivita - presenze,
          perc: totaleAttivita > 0 ? (presenze / totaleAttivita) * 100 : 0,
        };
      })
      .filter((m) => m.assenze >= 4)
      .sort((a, b) => b.assenze - a.assenze);
  }, [membres, passaggi, totaleAttivita]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split("\n");
      const dateRaw = lines[1]?.split(",")[0] || "Data Sconosciuta";
      Papa.parse(lines.slice(2).join("\n"), {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const processed = results.data
            .filter((row) => row["ALIMENTI"])
            .map((item) => {
              const match = (item["QUANTITA'"] || "").match(/(N\.|KG\.|PZ\.)\s*([\d,.]+)/i);
              return {
                prodotto: item["ALIMENTI"].trim(),
                quantita: match ? parseFloat(match[2].replace(",", ".")) : 0,
                unita: match ? match[1].replace(".", "").toUpperCase() : "N",
              };
            });
          try {
            const res = await fetch("/api/import-alimenti", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: processed, dateFile: dateRaw }),
            });
            if (res.ok) {
              setImportStats({ date: dateRaw, count: processed.length });
              setShowSuccessModal(true);
            }
          } catch (err) {
            console.error(err);
          } finally {
            setIsUploading(false);
          }
        },
      });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-10 pb-40 animate-in fade-in duration-700">
      
      {/* HEADER STATS RAPIDE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Totale Soci", val: membres.length, col: "text-blue-500" },
          { label: "Attivi", val: membres.filter((m) => m.stato?.toLowerCase() === "attivo").length, col: "text-emerald-500" },
          { label: "Studenti", val: dataStudenti[0].value, col: "text-purple-500" },
          { label: "Attività", val: totaleAttivita, col: "text-cyan-500" },
        ].map((stat, i) => (
          <div key={i} className="glass p-4 rounded-3xl border border-white/5 bg-white/5 transition-transform hover:scale-105">
            <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">{stat.label}</p>
            <p className={`text-2xl font-black ${stat.col}`}>{stat.val}</p>
          </div>
        ))}
      </div>

      {/* 1. AREA CHART - TREND PRESENZE */}
      <section className="glass p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/40 shadow-2xl">
        <h2 className="text-white font-black text-xs uppercase tracking-widest mb-6 opacity-50 px-2 italic">Analisi Flusso Partecipanti</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataAffluenza}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", borderRadius: "20px", border: "none", fontSize: "12px", fontWeight: "900" }} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={4} fill="url(#colorArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. GRID: STATO (PIE) & TIPOLOGIA (BAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-emerald-400">Salute del Club (Stato)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dataStati} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                {dataStati.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col text-center">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-blue-400">Distribuzione Ruoli</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataTipi} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 10, 10, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. GRID: STUDENTI (DONUT) & ALIMENTI (RADAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-purple-400">Status Studente</h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={dataStudenti} innerRadius={0} outerRadius={70} dataKey="value">
                {dataStudenti.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-cyan-400">Varietà Alimenti (Frequenza)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={dataAlimentiRadar}>
              <PolarGrid stroke="#ffffff10" />
              <PolarAngleAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 8 }} />
              <Radar name="Ricorrenza" dataKey="freq" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. SEZIONE CRITICA: ASSENZE */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-2">
            <h2 className="text-white font-black text-xs uppercase tracking-widest opacity-50 italic">Controllo Frequenza Critica</h2>
        </div>
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-red-500/5 space-y-4 shadow-xl">
          {inRischio.length === 0 ? (
            <p className="text-center text-slate-500 text-[10px] font-black uppercase py-6 tracking-widest">Nessuna criticità rilevata ✨</p>
          ) : (
            inRischio.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-end text-[10px] font-black uppercase">
                  <span className="text-white">{m.nome}</span>
                  <span className={m.assenze >= 5 ? "text-red-500 animate-pulse" : "text-yellow-500"}>{m.assenze} ASSENZE</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${m.assenze >= 5 ? "bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-yellow-500"}`} style={{ width: `${m.perc}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 5. IMPORTAZIONE (IN FONDO) */}
      <section className="pt-10 flex flex-col items-center">
        <div className="glass p-10 rounded-[3rem] border border-dashed border-white/20 bg-blue-600/5 text-center group w-full">
          <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-6 transition-transform group-hover:scale-110 shadow-2xl">
            <span className="text-3xl">📁</span>
          </div>
          <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-8">Gestione Archivio Digitale Alimenti</p>
          <label className={`w-full max-w-xs cursor-pointer ${isUploading ? "bg-slate-800" : "bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-600/30"} text-white py-5 px-10 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all inline-block active:scale-95`}>
            {isUploading ? "Analisi File..." : "Aggiorna Database"}
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
          </label>
        </div>
      </section>

      {/* MODAL DI SUCCESSO CUSTOM */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => window.location.reload()} />
          <div className="glass relative w-full max-w-sm p-10 rounded-[3rem] border border-white/20 bg-slate-900/90 text-center shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/30">
              <span className="text-5xl">✅</span>
            </div>
            <h3 className="text-white font-black text-2xl uppercase tracking-tighter mb-4">Ottimo Lavoro!</h3>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed px-2">
              Inventario del <span className="text-white font-bold">{importStats.date}</span> è stato elaborato. Abbiamo registrato <span className="text-emerald-400 font-bold">{importStats.count}</span> nuovi prodotti nel database.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-600/20 active:scale-95"
            >
              Aggiorna Dashboard
            </button>
          </div>
        </div>
      )}

    </div>
  );
}