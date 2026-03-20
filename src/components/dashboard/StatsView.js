import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
  CartesianGrid,
} from "recharts";

export default function StatsView({
  membres,
  passaggi,
  alimentiData = [],
  setAlimenti,
}) {
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
        const currentYear = new Date().getFullYear();
        return (
          new Date(currentYear, mA - 1, dA) - new Date(currentYear, mB - 1, dB)
        );
      });
  }, [passaggi]);

  // --- 2. DISTRIBUZIONE STATI (Pie Chart) ---
  const dataStati = useMemo(() => {
    const counts = membres.reduce((acc, m) => {
      const s =
        m.stato?.charAt(0).toUpperCase() + m.stato?.slice(1).toLowerCase() ||
        "Inattivo";
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

  const calcolaEtaDaCF = (cf) => {
    if (!cf || cf.length < 11) return null;
    let anno = parseInt(cf.substring(6, 8), 10);
    const meseLettera = cf.charAt(8).toUpperCase();
    let giorno = parseInt(cf.substring(9, 11), 10);

    // Gestione genere (se donna, giorno + 40)
    if (giorno > 40) giorno -= 40;

    // Determinazione secolo (00-26 = 2000, 27-99 = 1900)
    const annoCorrente = new Date().getFullYear() % 100;
    anno += anno <= annoCorrente ? 2000 : 1900;

    const oggi = new Date();
    let eta = oggi.getFullYear() - anno;
    return eta;
  };

  // --- LOGICA ETÀ GENERAZIONALE (Fasce Originali) ---
  const dataEta = useMemo(() => {
    // Le tue fasce originali
    const fasce = { "17-19": 0, "20-25": 0, "26-30": 0, "30+": 0 };
    let sommaEta = 0;
    let contati = 0;

    membres.forEach((m) => {
      const eta = calcolaEtaDaCF(m.codice_fiscale);
      if (eta && eta > 0 && eta < 100) {
        sommaEta += eta;
        contati++;
        if (eta <= 19) fasce["17-19"]++;
        else if (eta <= 25) fasce["20-25"]++;
        else if (eta <= 30) fasce["26-30"]++;
        else fasce["30+"]++;
      }
    });

    const chartData = [
      { name: "17-19", value: fasce["17-19"], color: "#3b82f6" },
      { name: "20-25", value: fasce["20-25"], color: "#8b5cf6" },
      { name: "26-30", value: fasce["26-30"], color: "#ec4899" },
      { name: "30+", value: fasce["30+"], color: "#f59e0b" },
    ].filter((d) => d.value > 0);

    return {
      chart: chartData,
      media: contati > 0 ? (sommaEta / contati).toFixed(1) : "0",
    };
  }, [membres]);

  // --- 4. STUDENTI VS NON STUDENTI (Donut Chart) ---
  const dataStudenti = useMemo(() => {
    const si = membres.filter(
      (m) =>
        m.is_studente?.toString().toUpperCase() === "SI" ||
        m.is_studente === true ||
        m.is_studente === "true",
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
      .slice(0, 15);
  }, [alimentiData]);

  // --- 6. LOGICA ASSENZE CRITICHE ---
  const totaleAttivita = dataAffluenza.length;
  const inRischio = useMemo(() => {
    return membres
      .filter((m) => {
        const tipo = m.tipologia_socio?.toUpperCase();
        return tipo === "VOLONTARIO" || tipo === "PASSIVO";
      })
      .map((m) => {
        const presenze = new Set(
          passaggi
            .filter((p) => p.nome_cognome === `${m.nome} ${m.cognome}`)
            .map((p) => new Date(p.scanned_at).toLocaleDateString()),
        ).size;

        const assenze = totaleAttivita - presenze;

        // --- LOGICA AUTOMATICA SOSPESO & EMAIL ---
        // Eseguiamo il controllo solo se il membro è ancora "ATTIVO"
        if (m.stato?.toUpperCase() === "ATTIVO") {
          if (assenze === 4) {
            // Invia Mail di Avviso (4 assenze)
            fetch("/api/notify-absence", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                membreId: m.id,
                type: "WARNING",
                email: m.email,
                nome: m.nome,
              }),
            }).catch((e) => console.error("Errore invio mail avviso", e));
          }

          if (assenze >= 5) {
            // 1. Cambia Stato in SOSPESO nel DB
            supabase
              .from("membres")
              .update({ stato: "SOSPESO" })
              .eq("id", m.id)
              .then(() => {
                // 2. Invia Mail di Sospensione
                fetch("/api/notify-absence", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    membreId: m.id,
                    type: "SUSPENSION",
                    email: m.email,
                    nome: m.nome,
                  }),
                });
              })
              .catch((e) => console.error("Errore sospensione automatica", e));
          }
        }

        return {
          nome: `${m.nome} ${m.cognome}`,
          assenze: assenze > 0 ? assenze : 0,
          perc: totaleAttivita > 0 ? (presenze / totaleAttivita) * 100 : 0,
          statoAttuale: m.stato?.toUpperCase(),
        };
      })
      .filter((m) => m.assenze >= 4)
      .sort((a, b) => b.assenze - a.assenze);
  }, [membres, passaggi, totaleAttivita]);

  return (
    <div className="space-y-10 pb-40 animate-in fade-in duration-700">
      {/* HEADER STATS RAPIDE */}
      <div className="grid grid-cols-4 gap-2 bg-white/[0.03] backdrop-blur-md rounded-2xl py-4 border border-white/5 shadow-2xl">
        {[
          {
            label: "Soci",
            val: membres.length,
            color: "from-blue-400 to-cyan-400",
          },
          {
            label: "Attivi",
            val: membres.filter((m) => m.stato?.toUpperCase() === "ATTIVO")
              .length,
            color: "from-emerald-400 to-teal-400",
          },
          {
            label: "Studenti",
            val: membres.filter(
              (m) => m.is_studente === "SI" || m.is_studente === true,
            ).length,
            color: "from-purple-400 to-pink-400",
          },
          {
            label: "Attività",
            val: totaleAttivita,
            color: "from-amber-400 to-orange-400",
          },
        ].map((s, i) => (
          <div
            key={i}
            className={`flex flex-col items-center justify-center ${i !== 3 ? "border-r border-white/5" : ""}`}
          >
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">
              {s.label}
            </p>
            <p
              className={`text-2xl font-black bg-gradient-to-br ${s.color} bg-clip-text text-transparent tracking-tighter`}
            >
              {s.val}
            </p>
          </div>
        ))}
      </div>

      {/* 1. AREA CHART - TREND PRESENZE */}
      <section className="glass p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/40 shadow-2xl">
        <h2 className="text-white font-black text-xs uppercase tracking-widest mb-6 opacity-50 px-2 italic">
          Analisi Flusso Partecipanti
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataAffluenza}>
              <defs>
                <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#ffffff05"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  borderRadius: "20px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: "900",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                strokeWidth={4}
                fill="url(#colorArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 2. GRID: STATO (PIE) & TIPOLOGIA (BAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-emerald-400">
            Stato
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataStati}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={8}
                dataKey="value"
              >
                {dataStati.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: "10px", fontWeight: "bold" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col text-center">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-blue-400">
            Distribuzione Ruoli
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataTipi} layout="vertical">
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                stroke="#94a3b8"
                fontSize={10}
                width={80}
              />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Bar
                dataKey="value"
                fill="#3b82f6"
                radius={[0, 10, 10, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass p-8 rounded-[3rem] border border-white/10 bg-slate-900/60 relative overflow-hidden shadow-2xl">
        <h3 className="text-white text-[10px] font-black uppercase tracking-[0.2em] mb-8 text-center opacity-50 italic">
          Composizione Generazionale
        </h3>
        <div className="h-72 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataEta.chart}
                innerRadius={65}
                outerRadius={95}
                paddingAngle={10}
                cornerRadius={12}
                dataKey="value"
              >
                {dataEta.chart.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: "20px",
                  backgroundColor: "#0f172a",
                  border: "1px solid #ffffff10",
                  fontSize: "12px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Testo centrale dinamico con la TUA media calcolata */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] text-blue-400 font-black tracking-widest uppercase mb-1">
              Età Media
            </span>
            <span className="text-4xl text-white font-black">
              {dataEta.media}
            </span>
          </div>
        </div>

        {/* Legenda con le TUE fasce */}
        <div className="flex justify-center flex-wrap gap-4 mt-4">
          {dataEta.chart.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[10px] text-slate-400 font-bold uppercase">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. GRID: STUDENTI (DONUT) & ALIMENTI (RADAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-purple-400">
            Studente?
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataStudenti}
                innerRadius={0}
                outerRadius={70}
                dataKey="value"
              >
                {dataStudenti.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-80 flex flex-col">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-4 opacity-50 text-cyan-400">
            Varietà Alimenti (Frequenza)
          </h3>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius="80%"
              data={dataAlimentiRadar}
            >
              <PolarGrid stroke="#ffffff10" />
              <PolarAngleAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 8 }}
              />
              <Radar
                name="Ricorrenza"
                dataKey="freq"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. SEZIONE CRITICA: ASSENZE */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-white font-black text-xs uppercase tracking-widest opacity-50 italic">
            Controllo Frequenza Critica
          </h2>
        </div>
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-red-500/5 space-y-4 shadow-xl">
          {inRischio.length === 0 ? (
            <p className="text-center text-slate-500 text-[10px] font-black uppercase py-6 tracking-widest">
              Nessuna criticità rilevata
            </p>
          ) : (
            inRischio.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-end text-[10px] font-black uppercase">
                  <span className="text-white">{m.nome}</span>
                  <span
                    className={
                      m.assenze >= 5
                        ? "text-red-500 animate-pulse"
                        : "text-yellow-500"
                    }
                  >
                    {m.assenze} ASSENZE
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${m.assenze >= 5 ? "bg-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "bg-yellow-500"}`}
                    style={{ width: `${m.perc}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
