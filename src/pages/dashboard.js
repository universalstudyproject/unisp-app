import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/router";
import StatsView from "@/components/dashboard/StatsView";
import Image from "next/image";

// Import dei sotto-componenti
import AdminView from "@/components/dashboard/AdminView";
import PassaggiView from "@/components/dashboard/PassaggiView";

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [passaggi, setPassaggi] = useState([]);
  const [membres, setMembres] = useState([]);
  const [activeTab, setActiveTab] = useState("passages");
  const [user, setUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [alimenti, setAlimenti] = useState([]);
  const [storicoPassaggi, setStoricoPassaggi] = useState([]);
  const [showExitModal, setShowExitModal] = useState(false);

  // STATI PER I LOG
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState([new Date().getMonth()]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [selectedMembre, setSelectedMembre] = useState(null);
  const [manualInput, setManualInput] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [modalAlert, setModalAlert] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [countSent, setCountSent] = useState(0);

  const monthsList = [
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];

  // Helper per verificare se un volontario è autorizzato (entro le 48h)
  const isAuthValid = (m) => {
    if (!m.auth_scan_active || !m.auth_scan_expires_at) return false;
    return new Date(m.auth_scan_expires_at) > new Date();
  };

  const toggleMonth = (idx) => {
    setSelectedMonths((prev) =>
      prev.includes(idx) ? prev.filter((m) => m !== idx) : [...prev, idx],
    );
  };

  // --- FUNZIONE DI LOGGING UNIVERSALE ---
  const createLog = async (
    action,
    details,
    targetId = null,
    targetName = null,
  ) => {
    const currentUser = user || JSON.parse(localStorage.getItem("unisp_user"));
    if (!currentUser) return;
    try {
      await supabase.from("logs").insert([
        {
          action,
          operator_id: currentUser.id,
          operator_name: `${currentUser.nome} ${currentUser.cognome}`,
          details,
          target_id: targetId,
          target_name: targetName,
        },
      ]);
    } catch (err) {
      console.error("Errore log:", err);
    }
  };

  // --- LOGICA AUTOMAZIONE EMAIL (MIGLIORATA) ---
  // --- LOGICA AUTOMAZIONE EMAIL (CORRETTA) ---
  const triggerAutoEmail = async (newMembersCount) => {
    if (newMembersCount <= 0) return;

    // Logghiamo l'inizio
    await createLog(
      "EMAIL_AUTO_TRIGGER",
      `Avviato invio automatico per ${newMembersCount} nuovi membri.`,
    );

    // Lanciamo il fetch e NON aspettiamo la risposta con 'await' se vogliamo che vada in background,
    // ma usiamo un segnale per gestire la persistenza.
    fetch("/api/send-bulk-qr", {
      method: "POST",
      keepalive: true, // <--- Fondamentale: permette alla richiesta di sopravvivere al reload della pagina
    })
      .then(async (res) => {
        const data = await res.json();
        if (data.success) {
          await createLog(
            "EMAIL_AUTO_SENT",
            `Inviati con successo ${data.count} QR Code.`,
          );
        } else {
          await createLog(
            "EMAIL_AUTO_ERROR",
            `Errore API: ${data.message || "Errore sconosciuto"}`,
          );
        }
      })
      .catch(async (err) => {
        console.error("Errore automazione:", err);
        await createLog("EMAIL_AUTO_CRASH", `Crash invio: ${err.message}`);
      });
  };

  // --- DOWNLOAD LOG TXT ---
  const downloadMonthlyLogs = async () => {
    if (selectedMonths.length === 0) return alert("Seleziona almeno un mese");
    setShowLogModal(false);
    setIsProcessing(true);
    try {
      for (const monthIdx of selectedMonths) {
        const year = new Date().getFullYear();
        const firstDay = new Date(year, monthIdx, 1).toISOString();
        const lastDay = new Date(
          year,
          monthIdx + 1,
          0,
          23,
          59,
          59,
        ).toISOString();
        const { data: logs } = await supabase
          .from("logs")
          .select("*")
          .gte("created_at", firstDay)
          .lte("created_at", lastDay)
          .order("created_at", { ascending: true });
        if (logs && logs.length > 0) {
          const monthName = monthsList[monthIdx].toUpperCase();
          let content = `REGISTRO UNISP - ${monthName} ${year}\n\n`;
          logs.forEach((l) => {
            content += `[${new Date(l.created_at).toLocaleString()}] ${l.action}\nOP: ${l.operator_name}\nDETTAGLI: ${l.details}\n${l.target_name ? `TARGET: ${l.target_name}\n` : ""}---\n`;
          });
          const blob = new Blob([content], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `LOG_${monthName}.txt`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchPassaggiOggi = async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("passaggi")
      .select(
        `id, scanned_at, numero_giornaliero, membres!membre_id ( nome, cognome )`,
      )
      .gt("scanned_at", startOfDay.toISOString())
      .order("scanned_at", { ascending: false });
    if (data) setPassaggi(data);
  };

  const fetchMembres = async () => {
    const { data } = await supabase
      .from("membres")
      .select("*")
      .order("cognome", { ascending: true });
    if (data) setMembres(data);
  };

  const authorizeVolontaire = async (id) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    const target = membres.find((m) => m.id === id);
    await supabase
      .from("membres")
      .update({
        auth_scan_active: true,
        auth_scan_expires_at: expiresAt.toISOString(),
      })
      .eq("id", id);
    await createLog(
      "AUTHORIZE_VOLUNTEER",
      "Abilitato scanner (48h)",
      id,
      `${target?.nome} ${target?.cognome}`,
    );
    fetchMembres();
  };

  const revokeVolontaire = async (id) => {
    const target = membres.find((m) => m.id === id);
    await supabase
      .from("membres")
      .update({ auth_scan_active: false, auth_scan_expires_at: null })
      .eq("id", id);
    await createLog(
      "REVOKE_VOLUNTEER",
      "Revocata autorizzazione",
      id,
      `${target?.nome} ${target?.cognome}`,
    );
    fetchMembres();
  };

  const updateMembreField = async (membreId, field, newValue) => {
    setIsProcessing(true);
    try {
      const oldValue = selectedMembre[field];
      await supabase
        .from("membres")
        .update({ [field]: newValue })
        .eq("id", membreId);
      await createLog(
        `UPDATE_${field.toUpperCase()}`,
        `Da ${oldValue} a ${newValue}`,
        membreId,
        `${selectedMembre.nome} ${selectedMembre.cognome}`,
      );
      setMembres((prev) =>
        prev.map((m) => (m.id === membreId ? { ...m, [field]: newValue } : m)),
      );
      setSelectedMembre((prev) => ({ ...prev, [field]: newValue }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanSuccess = async (qrCode) => {
    const { data: membre } = await supabase
      .from("membres")
      .select("id, nome, cognome, stato, email")
      .eq("codice_qr", qrCode.trim())
      .single();
    if (!membre)
      return setFeedback({
        name: "SCONOSCIUTO",
        bgColor: "bg-slate-900",
        message: "QR NON VALIDO",
        icon: "🚫",
      });
    const nomComplet = `${membre.nome} ${membre.cognome}`;
    if (membre.stato?.toUpperCase() !== "ATTIVO")
      return setFeedback({
        name: nomComplet,
        bgColor: "bg-red-600",
        message: membre.stato.toUpperCase(),
        icon: "🔒",
      });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: check } = await supabase
      .from("passaggi")
      .select("numero_giornaliero")
      .eq("membre_id", membre.id)
      .gt("scanned_at", startOfDay.toISOString())
      .maybeSingle();
    if (check)
      return setFeedback({
        name: nomComplet,
        bgColor: "bg-blue-500",
        message: `GIÀ PASSATO (${check.numero_giornaliero})`,
        icon: "ℹ️",
      });
    const { error: insErr } = await supabase
      .from("passaggi")
      .insert([{ membre_id: membre.id }]);
    if (!insErr) {
      await createLog(
        "SCAN_SUCCESS",
        "Ingresso registrato",
        membre.id,
        nomComplet,
      );
      fetchPassaggiOggi();
      setFeedback({
        name: nomComplet,
        bgColor: "bg-green-600",
        message: "ENTRATA VALIDA",
        icon: "✅",
      });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleLogout = async () => {
    await createLog("LOGOUT", "Uscita dal sistema");
    localStorage.removeItem("unisp_user");
    window.location.href = "/";
  };

  const startScanner = () => {
    // 1. Recuperiamo la tipologia (assicuriamoci che esista)
    const tipologia = user?.tipologia_socio?.toUpperCase();

    // 2. Se sei ADMIN o STAFF, apri sempre la camera
    if (tipologia === "ADMIN" || tipologia === "STAFF") {
      setManualInput(false);
      setScanning(true);
      return;
    }

    // 3. Se sei VOLONTARIO, controlla l'autorizzazione delle 48h
    if (tipologia === "VOLONTARIO") {
      if (isAuthValid(user)) {
        setManualInput(false);
        setScanning(true);
      } else {
        setModalAlert({
          title: "ACCESSO NEGATO",
          message:
            "Autorizzazione scaduta o non attiva. Contatta l'amministratore.",
          icon: "🔒",
        });
      }
      return;
    }

    // 4. Per tutti gli altri (PASSIVO, SCONOSCIUTO, ecc.), blocca e NON aprire nulla
    setModalAlert({
      title: "NON AUTORIZZATO",
      message:
        "Solo lo staff e i volontari autorizzati possono usare lo scanner.",
      icon: "🚫",
    });
  };

  useEffect(() => {
    setMounted(true);
    const storedUser = localStorage.getItem("unisp_user");
    if (!storedUser) {
      router.replace("/");
      return;
    }
    const parsed = JSON.parse(storedUser);
    setUser(parsed);
    if (["STAFF", "ADMIN"].includes(parsed?.tipologia_socio?.toUpperCase())) {
      fetchMembres();
      fetchPassaggiOggi();
      supabase
        .from("alimenti")
        .select("*")
        .then(({ data }) => setAlimenti(data));
      supabase
        .from("passaggi")
        .select("membre_id, scanned_at")
        .then(({ data }) => setStoricoPassaggi(data));
    }
  }, []);

  if (!mounted) return null;
  const isStaff =
    user?.tipologia_socio?.toUpperCase() === "STAFF" ||
    user?.tipologia_socio?.toUpperCase() === "ADMIN";
  const isAdmin = user?.tipologia_socio?.toUpperCase() === "ADMIN";

  // LOGICA FILTRI RIPRISTINATA
  const filteredMembres = membres.filter((m) => {
    const matchesSearch = `${m.nome} ${m.cognome}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    if (filter === "ALL") return matchesSearch;
    if (filter === "STAFF")
      return (
        matchesSearch &&
        (m.tipologia_socio?.toUpperCase() === "STAFF" ||
          m.tipologia_socio?.toUpperCase() === "ADMIN")
      );
    if (filter === "VOLONTARIO")
      return matchesSearch && m.tipologia_socio?.toUpperCase() === "VOLONTARIO";
    if (filter === "ACCESSI") return matchesSearch && isAuthValid(m); // RIPRISTINATO FILTRO ACCESSI
    return matchesSearch;
  });

  return (
    <Layout>
      <div className="space-y-6">
        <nav className="bg-slate-900/90 border border-white/10 backdrop-blur-xl h-14 rounded-full px-2 flex items-center shadow-2xl sticky top-2 z-[90]">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center ml-1 flex-shrink-0 shadow-lg p-0.5 overflow-hidden">
            <Image
              src="/logo-unisp.png"
              alt="Logo"
              width={40}
              height={40}
              className="object-contain p-1"
              priority
            />
          </div>
          <div className="flex grow justify-center gap-6 px-2">
            <button
              onClick={() => setActiveTab("passages")}
              className={`text-[10px] font-black uppercase tracking-widest ${activeTab === "passages" ? "text-blue-500" : "text-slate-500"}`}
            >
              Passaggi
            </button>
            {isStaff && (
              <>
                <button
                  onClick={() => setActiveTab("membres")}
                  className={`text-[10px] font-black uppercase tracking-widest ${activeTab === "membres" ? "text-blue-500" : "text-slate-500"}`}
                >
                  Membri
                </button>
                <button
                  onClick={() => setActiveTab("stats")}
                  className={`text-[10px] font-black uppercase tracking-widest ${activeTab === "stats" ? "text-blue-500" : "text-slate-500"}`}
                >
                  Stat
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setShowLogModal(true)}
                    className="flex items-center justify-center"
                  >
                    {isProcessing ? (
                      <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-2"></div>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-500 px-2 transition-colors">
                        Log
                      </span>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </nav>

        {activeTab === "passages" ? (
          <PassaggiView passaggi={passaggi} />
        ) : activeTab === "membres" ? (
          <AdminView
            membres={filteredMembres}
            filter={filter}
            setFilter={setFilter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            setSelectedMembre={setSelectedMembre}
            isAuthValid={isAuthValid}
            authorizeVolontaire={authorizeVolontaire}
            revokeVolontaire={revokeVolontaire}
            updateMembreField={updateMembreField}
            createLog={createLog}
            triggerAutoEmail={triggerAutoEmail}
          />
        ) : (
          <StatsView
            membres={membres}
            passaggi={storicoPassaggi}
            alimentiData={alimenti}
          />
        )}
      </div>

      {!scanning && (
        <button
          onClick={startScanner}
          className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-xl z-50 active:scale-90 border border-white/10"
        >
          <svg
            className="h-8 w-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>
        </button>
      )}

      {/* MODALE SCELTA MESI LOG */}
      {showLogModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setShowLogModal(false)}
          ></div>
          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl">
            <h2 className="text-white font-light text-xs  mb-4 text-center tracking-tighter">
              Seleziona i mesi per cui vuoi scaricare i log
            </h2>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {monthsList.map((month, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleMonth(idx)}
                  className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${selectedMonths.includes(idx) ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white/5 border-white/10 text-slate-400"}`}
                >
                  {month.substring(0, 3)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={downloadMonthlyLogs}
                className="w-full bg-emerald-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest active:scale-95 transition-all"
              >
                scarica files
              </button>
              <button
                onClick={() => setShowLogModal(false)}
                className="w-full bg-white/5 py-4 rounded-2xl font-black text-slate-300 uppercase border border-white/10"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE LOGOUT */}
      {showExitModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setShowExitModal(false)}
          ></div>
          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-sm rounded-[3rem] p-10 text-center shadow-2xl">
            <h2 className="text-white font-black text-2xl uppercase mb-2 leading-none">
              Vuoi uscire?
            </h2>
            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={handleLogout}
                className="w-full bg-red-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest active:scale-95 transition-all"
              >
                Sì, Esci
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full bg-white/5 py-4 rounded-2xl font-black text-slate-300 uppercase border border-white/10"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE DETTAGLI MEMBRO */}
      {selectedMembre && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-[2.5rem] border border-white/10 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-6 bg-[#1e293b] border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl text-white uppercase font-black">
                {selectedMembre.nome} {selectedMembre.cognome}
              </h2>
              <button
                onClick={() => setSelectedMembre(null)}
                className="text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {Object.entries(selectedMembre).map(([k, v]) => {
                if (
                  [
                    "id",
                    "password",
                    "created_at",
                    "nome",
                    "cognome",
                    "codice_qr",
                    "auth_scan_active",
                    "auth_scan_expires_at",
                    "mail_sent",
                  ].includes(k)
                )
                  return null;
                const isLink = typeof v === "string" && v.startsWith("http");
                return (
                  <div
                    key={k}
                    className="bg-white/5 p-4 rounded-2xl border border-white/5"
                  >
                    <p className="text-[9px] uppercase text-blue-400 font-black mb-1">
                      {k.replace(/_/g, " ")}
                    </p>
                    {k === "tipologia_socio" ? (
                      <select
                        value={v || ""}
                        onChange={(e) =>
                          updateMembreField(
                            selectedMembre.id,
                            k,
                            e.target.value,
                          )
                        }
                        className="w-full bg-slate-800 text-white text-sm font-bold p-2 rounded-lg outline-none border border-white/10"
                      >
                        {["PASSIVO", "VOLONTARIO", "ADMIN", "STAFF"].map(
                          (opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ),
                        )}
                      </select>
                    ) : k === "stato" ? (
                      <select
                        value={v || ""}
                        onChange={(e) =>
                          updateMembreField(
                            selectedMembre.id,
                            k,
                            e.target.value,
                          )
                        }
                        className="w-full bg-slate-800 text-white text-sm font-bold p-2 rounded-lg outline-none border border-white/10"
                      >
                        {["ATTIVO", "INATTIVO", "SOSPESO", "ESCLUSO"].map(
                          (opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ),
                        )}
                      </select>
                    ) : isLink ? (
                      <a
                        href={v}
                        target="_blank"
                        className="text-blue-400 text-sm font-medium underline break-all"
                      >
                        Vedi Documento →
                      </a>
                    ) : (
                      <p className="text-slate-100 text-sm font-medium">
                        {String(v || "-")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-6 border-t border-white/5">
              <button
                onClick={() => setSelectedMembre(null)}
                className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white uppercase"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK SCANNER */}
      {feedback && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
            onClick={() => setFeedback(null)}
          ></div>
          <div
            className={`relative ${feedback.bgColor} w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl border border-white/30 text-center`}
          >
            <div className="text-7xl mb-6">{feedback.icon}</div>
            <h3 className="text-white text-xs font-black uppercase mb-4">
              {feedback.name}
            </h3>
            <p className="text-white text-4xl font-black uppercase tracking-tighter mb-2">
              {feedback.message}
            </p>
            <button
              onClick={() => setFeedback(null)}
              className="mt-12 bg-white text-slate-900 px-10 py-4 rounded-full text-[11px] font-black uppercase"
            >
              Continua
            </button>
          </div>
        </div>
      )}

      {scanning && (
        <div className="fixed inset-0 bg-[#0f172a] z-[200] flex flex-col items-center">
          <div className="p-6 w-full flex justify-between items-center bg-slate-900/80 text-white border-b border-white/5">
            <span className="font-black text-blue-500 text-[10px] uppercase tracking-widest">
              {manualInput ? "Inserimento Manuale" : "Scanner Attivo"}
            </span>
            <button
              onClick={() => {
                setScanning(false);
                setManualInput(false);
              }}
              className="bg-white/10 w-10 h-10 rounded-full text-2xl"
            >
              &times;
            </button>
          </div>
          <div className="w-full grow flex flex-col items-center justify-center p-6">
            {!manualInput ? (
              <div className="w-full flex flex-col items-center">
                <div
                  id="reader"
                  className="w-full max-w-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
                ></div>
                <button
                  onClick={() => setManualInput(true)}
                  className="mt-10 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-blue-400 text-[10px] font-black uppercase"
                >
                  Codice Manuale
                </button>
              </div>
            ) : (
              <div className="glass w-full max-w-sm p-10 rounded-[3rem] border border-white/10 text-center space-y-6 shadow-2xl">
                <input
                  type="text"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-4 py-5 text-white text-center font-black tracking-[0.4em] outline-none"
                />
                <button
                  onClick={() => {
                    handleScanSuccess(manualCode);
                    setManualCode("");
                    setManualInput(false);
                  }}
                  className="w-full bg-blue-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest"
                >
                  Conferma
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {modalAlert && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setModalAlert(null)}
          ></div>
          <div className="relative glass bg-slate-900 border border-white/10 w-full max-w-sm rounded-[3rem] p-8 text-center shadow-2xl">
            <div className="text-6xl mb-4">{modalAlert.icon}</div>
            <h2 className="text-white font-black text-xl mb-3">
              {modalAlert.title}
            </h2>
            <p className="text-slate-400 text-sm mb-8">{modalAlert.message}</p>
            <button
              onClick={() => setModalAlert(null)}
              className="w-full bg-blue-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest"
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
