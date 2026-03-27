import React, { useState, useMemo } from "react";
import { supabase } from "../../lib/supabase";
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
  FunnelChart,
  Funnel,
  RadialBarChart,
  RadialBar,
} from "recharts";

export default function StatsView({
  membres,
  passaggi,
  alimentiData = [],
  setAlimenti,
  currentUser,
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

  // --- CALCUL DYNAMIQUE DES ABSENCES POUR LES ALERTES ---
  const inRischio = useMemo(() => {
    if (!membres || !passaggi) return [];

    // 1. Détecter les jours d'activité (comme pour le graphique)
    const giorniDiAttivita = [
      ...new Set(
        passaggi.map((p) => {
          const d = new Date(p.scanned_at);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }),
      ),
    ];

    // 2. Calculer les absences de chaque Volontaire et Passivo
    const stats = membres
      .filter((m) =>
        ["VOLONTARIO", "PASSIVO"].includes(m.tipologia_socio?.toUpperCase()),
      )
      .map((m) => {
        const dateIscrizione = m.created_at
          ? new Date(m.created_at).setHours(0, 0, 0, 0)
          : 0;
        const fullName = `${m.nome} ${m.cognome}`.toLowerCase();

        // Ses présences
        const presenze = new Set(
          passaggi
            .filter((p) => p.nome_cognome?.toLowerCase() === fullName)
            .map((p) => {
              const d = new Date(p.scanned_at);
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            }),
        ).size;

        // Les activités valides depuis son inscription
        const attivitaValide = giorniDiAttivita.filter((dateStr) => {
          const [anno, mese, giorno] = dateStr.split("-");
          return (
            new Date(anno, mese - 1, giorno).setHours(0, 0, 0, 0) >=
            dateIscrizione
          );
        }).length;

        // Ses absences réelles
        const assenze =
          attivitaValide > presenze ? attivitaValide - presenze : 0;

        // Calcul du pourcentage pour la jauge visuelle (5 absences = barre pleine à 100%)
        const perc = Math.min((assenze / 5) * 100, 100);

        return { ...m, assenze, perc };
      });

    // 3. Ne garder que ceux qui ont au moins 1 absence et trier du pire au meilleur
    return stats
      .filter((m) => m.assenze >= 3)
      .sort((a, b) => b.assenze - a.assenze);
  }, [membres, passaggi]);

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
              (m) => m.is_studente === "SI" && m.stato === "ATTIVO",
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
      {/* --- PARTIE 2 : ALERTES CRITIQUES --- */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-white font-black text-xs uppercase tracking-widest opacity-50 italic">
            Controllo Frequenza Critica
          </h2>
        </div>
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-red-500/5 space-y-4 shadow-xl">
          {inRischio.filter((m) => {
            // Si Staff/Admin : on montre tous les membres en risque
            if (
              ["STAFF", "ADMIN"].includes(
                currentUser?.tipologia_socio?.toUpperCase(),
              )
            )
              return true;
            // Sinon : on ne montre l'alerte que si c'est l'utilisateur lui-même
            return m.id === currentUser?.id;
          }).length === 0 ? (
            <p className="text-center text-slate-500 text-[10px] font-black uppercase py-6 tracking-widest">
              Nessuna criticità rilevata
            </p>
          ) : (
            inRischio
              .filter((m) => {
                if (
                  ["STAFF", "ADMIN"].includes(
                    currentUser?.tipologia_socio?.toUpperCase(),
                  )
                )
                  return true;
                return m.id === currentUser?.id;
              })
              .map((m, i) => (
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
      </div>
      {/* 1. AREA CHART - TREND PRESENZE */}
      <section className="glass p-6 rounded-[2.5rem] border border-white/10 h-30 bg-slate-900/40 shadow-2xl">
        <h2 className="text-white font-black text-xs uppercase tracking-widest mb-6 opacity-50 px-2 italic">
          Analisi Flusso Partecipanti
        </h2>
        <div className="h-22">
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
        {/* DESIGN STATO : BARRE HORIZONTALE PROPORTIONNELLE */}
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/60 h-40 flex flex-col justify-center relative overflow-hidden shadow-2xl">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-8 opacity-70 text-emerald-400 absolute top-6 left-0 right-0">
            Stato Attuale
          </h3>

          <div className="w-full px-2">
            {/* La Barre Horizontale Stylée */}
            <div className="w-full h-14 flex rounded-2xl overflow-hidden shadow-inner bg-slate-800/50 border border-white/5">
              {(() => {
                const total = dataStati.reduce(
                  (acc, curr) => acc + curr.value,
                  0,
                );

                return dataStati.map((status, index) => {
                  const perc = total > 0 ? (status.value / total) * 100 : 0;

                  return (
                    <div
                      key={index}
                      style={{
                        width: `${perc}%`,
                        backgroundColor: status.color,
                      }}
                      className="h-full flex items-center justify-center transition-all duration-1000 group relative hover:opacity-90 cursor-default"
                    >
                      {/* Tooltip (Info-bulle) au survol */}
                      <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs font-bold py-1.5 px-3 rounded-xl border border-white/10 whitespace-nowrap z-10 shadow-xl pointer-events-none">
                        {status.name}: {status.value} ({Math.round(perc)}%)
                      </div>

                      {/* Affichage du nombre dans la barre si l'espace est suffisant */}
                      {perc > 10 && (
                        <span className="text-white font-black text-[11px] drop-shadow-md">
                          {status.value}
                        </span>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Légende épurée en dessous */}
            <div className="flex justify-center flex-wrap gap-5 mt-10">
              {dataStati.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-md shadow-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-white/5 h-40 flex flex-col text-center">
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
                fontSize={7}
                width={80}
              />
              <Tooltip cursor={{ fill: "transparent" }} />
              <Bar
                dataKey="value"
                fill="#3b82f6"
                radius={[0, 5, 5, 0]}
                barSize={10}
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

      {/* 3. GRID: STUDENTI (RADIAL NEON) & ALIMENTI (RADAR) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* NOUVEAU DESIGN : JAUGE CIRCULAIRE NEON */}
        <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/60 h-80 flex flex-col relative overflow-hidden shadow-2xl">
          <h3 className="text-white text-[10px] font-black uppercase tracking-widest text-center mb-2 opacity-70 text-purple-400">
            Studente?
          </h3>

          <div className="flex-1 relative w-full h-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="100%"
                barSize={14}
                /* On inverse les données pour avoir "Studenti" sur l'anneau extérieur */
                data={[...dataStudenti].reverse()}
                startAngle={90}
                endAngle={-270}
              >
                {/* L'axe caché permet de calculer les proportions par rapport au total */}
                <PolarAngleAxis
                  type="number"
                  domain={[
                    0,
                    dataStudenti.reduce((acc, curr) => acc + curr.value, 0),
                  ]}
                  angleAxisId={0}
                  tick={false}
                />
                <RadialBar
                  minAngle={15}
                  background={{ fill: "#ffffff0a" }}
                  clockWise
                  dataKey="value"
                  cornerRadius={10}
                >
                  {[...dataStudenti].reverse().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </RadialBar>
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    borderRadius: "16px",
                    backgroundColor: "#0f172a",
                    border: "1px solid #ffffff10",
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#fff" }}
                />
              </RadialBarChart>
            </ResponsiveContainer>

            {/* Pourcentage central absolu */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-2">
              {(() => {
                const studenti =
                  dataStudenti.find((d) => d.name === "Studenti")?.value || 0;
                const total = dataStudenti.reduce(
                  (acc, curr) => acc + curr.value,
                  0,
                );
                const perc =
                  total > 0 ? Math.round((studenti / total) * 100) : 0;
                return (
                  <>
                    <span className="text-4xl text-purple-400 font-black">
                      {perc}%
                    </span>
                    <span className="text-[9px] text-white font-bold tracking-widest uppercase opacity-80 mt-1">
                      Studenti
                    </span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Légende personnalisée épurée */}
          <div className="flex justify-center flex-wrap gap-4 mt-2">
            {dataStudenti.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full border-2 border-slate-900/50"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* VARIETÀ ALIMENTI : INTACT COMME DEMANDÉ */}
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
                stroke="#f6b65c"
                fill="#f6c05c"
                fillOpacity={0.6}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. SEZIONE FREQUENZA E CRITICITÀ */}
      <section className="space-y-6">
        {/* --- PARTIE 1 : PRÉSENCES ET ABSENCES (GRAPHIQUE AVEC NOMS) --- */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-white font-black text-xs uppercase tracking-widest opacity-50 italic">
              {["STAFF", "ADMIN"].includes(
                currentUser?.tipologia_socio?.toUpperCase(),
              )
                ? "Frequenza: Volontari e Passivi"
                : "La Mia Frequenza"}
            </h2>
          </div>
          <div className="glass p-6 rounded-[2.5rem] border border-white/10 bg-slate-900/40 space-y-4 shadow-xl h-35">
            <ResponsiveContainer width="100%" height="150%">
              <BarChart
                data={(() => {
                  const giorniDiAttivita = [
                    ...new Set(
                      passaggi.map((p) => {
                        const d = new Date(p.scanned_at);
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                      }),
                    ),
                  ].sort();

                  const isStaffOrAdmin = ["STAFF", "ADMIN"].includes(
                    currentUser?.tipologia_socio?.toUpperCase(),
                  );

                  let membriDaMostrare = [];
                  if (isStaffOrAdmin) {
                    membriDaMostrare = membres.filter((m) =>
                      ["VOLONTARIO", "PASSIVO"].includes(
                        m.tipologia_socio?.toUpperCase(),
                      ),
                    );
                  } else {
                    const mioProfilo =
                      membres.find((m) => m.id === currentUser?.id) ||
                      currentUser;
                    if (mioProfilo) membriDaMostrare = [mioProfilo];
                  }

                  return giorniDiAttivita.map((dateStr) => {
                    const [anno, mese, giorno] = dateStr.split("-");
                    const dataAttivitaMs = new Date(
                      anno,
                      mese - 1,
                      giorno,
                    ).setHours(0, 0, 0, 0);

                    const dayData = { date: `${giorno}/${mese}` };

                    membriDaMostrare.forEach((m) => {
                      const dateIscrizione = m.created_at
                        ? new Date(m.created_at).setHours(0, 0, 0, 0)
                        : 0;

                      if (dataAttivitaMs >= dateIscrizione) {
                        const fullName = `${m.nome} ${m.cognome}`.toLowerCase();

                        const scan = passaggi.find((p) => {
                          if (p.nome_cognome?.toLowerCase() !== fullName)
                            return false;
                          const d = new Date(p.scanned_at);
                          const pDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          return pDate === dateStr;
                        });

                        if (scan) {
                          const scanTime = new Date(scan.scanned_at);
                          const timeAsNumber =
                            scanTime.getHours() + scanTime.getMinutes() / 60;

                          // PRESENCE
                          dayData[`${m.id}_time`] = timeAsNumber;
                          dayData[`${m.id}_assente`] = 0; // IMPORTANT: on met 0 d'absence
                          dayData[`${m.id}_timeStr`] =
                            `${String(scanTime.getHours()).padStart(2, "0")}:${String(scanTime.getMinutes()).padStart(2, "0")}`;
                          dayData[`${m.id}_nome`] = m.nome;
                        } else {
                          // ABSENCE (On crée une mini-barre de hauteur "0.8")
                          dayData[`${m.id}_time`] = 0;
                          dayData[`${m.id}_assente`] = 0.8;
                          dayData[`${m.id}_nome`] = m.nome;
                        }
                      }
                    });
                    return dayData;
                  });
                })()}
                margin={{ top: 10, right: 5, left: -10, bottom: 25 }}
              >
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
                  dy={10}
                />

                <YAxis
                  width={60}
                  domain={[0, 24]}
                  ticks={[0, 6, 12, 18, 24]}
                  stroke="#64748b"
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => {
                    if (val === 0) return "Assente";
                    return `${val}h`;
                  }}
                />

                {/* --- LA MAGIE EST ICI : shared={false} --- */}
                <Tooltip
                  shared={false}
                  cursor={{ fill: "#ffffff05" }}
                  content={({ active, payload, label }) => {
                    // On ne lit QUE la barre sur laquelle se trouve la souris (payload[0])
                    if (active && payload && payload.length) {
                      const dataPoint = payload[0];
                      const dataKey = dataPoint.dataKey;
                      const memberId = dataKey.split("_")[0];
                      const isAssente = dataKey.includes("_assente");

                      const rowData = dataPoint.payload;
                      const nome = rowData[`${memberId}_nome`];
                      const timeStr = rowData[`${memberId}_timeStr`];

                      if (!nome) return null;

                      return (
                        <div className="bg-slate-900 border border-white/10 p-3 rounded-xl shadow-2xl min-w-[120px]">
                          <p className="text-white font-black text-xs uppercase mb-2 border-b border-white/10 pb-1">
                            {label}
                          </p>
                          <div
                            className={`text-[10px] font-bold uppercase tracking-widest flex flex-col gap-1 ${isAssente ? "text-amber-500" : "text-emerald-500"}`}
                          >
                            <span>{nome}</span>
                            <span>
                              {isAssente ? "ASSENTE" : `Ore: ${timeStr}`}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* DESSIN DES BARRES ET MINI-BARRES D'ABSENCE */}
                {(() => {
                  const isStaffOrAdmin = ["STAFF", "ADMIN"].includes(
                    currentUser?.tipologia_socio?.toUpperCase(),
                  );
                  let membriDaMostrare = [];
                  if (isStaffOrAdmin) {
                    membriDaMostrare = membres.filter((m) =>
                      ["VOLONTARIO", "PASSIVO"].includes(
                        m.tipologia_socio?.toUpperCase(),
                      ),
                    );
                  } else {
                    const mioProfilo =
                      membres.find((m) => m.id === currentUser?.id) ||
                      currentUser;
                    if (mioProfilo) membriDaMostrare = [mioProfilo];
                  }

                  return membriDaMostrare.map((m) => (
                    <React.Fragment key={m.id}>
                      {/* stackId = Chaque membre a son propre "couloir" pour ne pas chevaucher les autres */}
                      <Bar
                        stackId={`stack_${m.id}`}
                        dataKey={`${m.id}_time`}
                        fill="#10b981"
                        barSize={8}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        stackId={`stack_${m.id}`}
                        dataKey={`${m.id}_assente`}
                        fill="#f59e0b"
                        barSize={8}
                        radius={[4, 4, 0, 0]}
                      />
                    </React.Fragment>
                  ));
                })()}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
