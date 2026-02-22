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

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [selectedMembre, setSelectedMembre] = useState(null);
  const [manualInput, setManualInput] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [modalAlert, setModalAlert] = useState(null);

  // --- LOGICA INVIO MAIL ---
  const [showSuccess, setShowSuccess] = useState(false);
  const [countSent, setCountSent] = useState(0);

  const handleBulkSend = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/send-bulk-qr", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCountSent(data.count);
        setShowSuccess(true);
        fetchMembres(); // Rinfresca la lista per vedere i flag mail_sent aggiornati
      } else {
        alert(data.message || "Nessun nuovo QR da inviare.");
      }
    } catch (e) {
      alert("Errore invio");
    } finally {
      setIsProcessing(false);
    }
  };

  const closeAllModals = () => {
    setScanning(false);
    setFeedback(null);
    setSelectedMembre(null);
    setModalAlert(null);
    setShowSuccess(false);
    setManualInput(false);
  };

  const fetchStoricoPassaggi = async () => {
    const { data } = await supabase
      .from("passaggi")
      .select("membre_id, scanned_at") // Ci servono solo questi per le statistiche
      .order("scanned_at", { ascending: true });
    if (data) setStoricoPassaggi(data);
  };

  // --- LOGICA DATI ---
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

  const fetchAlimenti = async () => {
    const { data } = await supabase.from("alimenti").select("*");
    if (data) setAlimenti(data);
  };

  const authorizeVolontaire = async (id) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    await supabase
      .from("membres")
      .update({
        auth_scan_active: true,
        auth_scan_expires_at: expiresAt.toISOString(),
      })
      .eq("id", id);
    fetchMembres();
  };

  const revokeVolontaire = async (id) => {
    await supabase
      .from("membres")
      .update({ auth_scan_active: false, auth_scan_expires_at: null })
      .eq("id", id);
    fetchMembres();
  };

  const isAuthValid = (m) =>
    m.auth_scan_active && new Date(m.auth_scan_expires_at) > new Date();

  const showFeedback = (name, bgColor, message, icon) => {
    let glowColor = "shadow-blue-500/50";
    if (bgColor.includes("green")) glowColor = "shadow-green-500/50";
    if (bgColor.includes("red")) glowColor = "shadow-red-500/50";
    setFeedback({ name, bgColor, message, icon, glowColor });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleScanSuccess = async (qrCode) => {
    const { data: membre } = await supabase
      .from("membres")
      .select("id, nome, cognome, stato, email")
      .eq("codice_qr", qrCode.trim())
      .single();
    if (!membre)
      return showFeedback(
        "SCONOSCIUTO",
        "bg-slate-900/90",
        "QR Code non valido",
        "🚫",
      );

    const nomComplet = `${membre.nome} ${membre.cognome}`;
    if (membre.stato?.toUpperCase() !== "ATTIVO") {
      let color = "bg-red-600/90";
      if (membre.stato?.toUpperCase() === "SOSPESO") color = "bg-yellow-600/90";
      return showFeedback(nomComplet, color, membre.stato.toUpperCase(), "🔒");
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: checkRecent } = await supabase
      .from("passaggi")
      .select("numero_giornaliero")
      .eq("membre_id", membre.id)
      .gt("scanned_at", startOfDay.toISOString())
      .maybeSingle();

    if (checkRecent)
      return showFeedback(
        nomComplet,
        "bg-blue-500/90",
        `GIÀ PASSATO (N° ${checkRecent.numero_giornaliero})`,
        "ℹ️",
      );

    // 2. Registriamo il passaggio
    const { error: insertError } = await supabase
      .from("passaggi")
      .insert([{ membre_id: membre.id }]);

    if (!insertError) {
      setTimeout(async () => {
        const { data: finalData } = await supabase
          .from("passaggi")
          .select("numero_giornaliero")
          .eq("membre_id", membre.id)
          .gt("scanned_at", startOfDay.toISOString())
          .single();

        const nGiorno = finalData?.numero_giornaliero || "??";

        showFeedback(
          `${membre.nome} ${membre.cognome}`,
          "bg-green-500/90",
          `ENTRATA VALIDA N° ${nGiorno}`,
          "✅",
        );

        fetchPassaggiOggi();

        // 3. INVIO MAIL DI NOTIFICA IN BACKGROUND
        if (membre.email) {
          fetch("/api/notify-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: membre.email,
              nome: membre.nome,
              numero_giornaliero: nGiorno,
            }),
          }).catch((err) => console.error("Errore notifica mail:", err));
        }
      }, 200);
    }
  };

  const startScanner = () => {
    if (user?.tipologia_socio?.toUpperCase() === "VOLONTARIO") {
      const now = new Date();
      const expiry = user.auth_scan_expires_at
        ? new Date(user.auth_scan_expires_at)
        : null;
      if (!user.auth_scan_active || !expiry || now > expiry) {
        setModalAlert({
          title: "ACCESSO NEGATO",
          message: "La tua autorizzazione è scaduta. Contatta lo STAFF.",
          icon: "🔒",
        });
        return;
      }
    }
    setManualInput(false);
    setScanning(true);
  };

  // --- EFFETTI ---
  useEffect(() => {
    setMounted(true);
    const storedUser = localStorage.getItem("unisp_user");

    if (!storedUser) {
      router.replace("/");
      return;
    }

    const parsed = JSON.parse(storedUser);
    setUser(parsed);

    // Caricamento dati (solo al primo avvio)
    if (membres.length === 0) {
      if (parsed?.tipologia_socio?.toUpperCase() === "STAFF") fetchMembres();
      fetchPassaggiOggi();
      fetchAlimenti();
      fetchStoricoPassaggi();
    }

    // --- LOGICA TASTO INDIETRO CON CONFERMA USCITA ---
    const handleBackButton = () => {
      const isAnyModalOpen =
        scanning ||
        feedback ||
        selectedMembre ||
        modalAlert ||
        showSuccess ||
        showExitModal;

      if (isAnyModalOpen) {
        // Se c'è un modale aperto (incluso quello di uscita), chiudiamo tutto
        closeAllModals();
        setShowExitModal(false);
        window.history.pushState(null, null, window.location.pathname);
      } else if (activeTab !== "passages") {
        // Se siamo su un altro tab, torniamo a Passaggi
        setActiveTab("passages");
        window.history.pushState(null, null, window.location.pathname);
      } else {
        // Se siamo su Passaggi e non ci sono modali, chiediamo conferma prima di uscire
        setShowExitModal(true);
        window.history.pushState(null, null, window.location.pathname);
      }
    };

    window.history.pushState(null, null, window.location.pathname);
    window.addEventListener("popstate", handleBackButton);

    const interval = setInterval(fetchPassaggiOggi, 10000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [
    activeTab,
    scanning,
    feedback,
    selectedMembre,
    modalAlert,
    showSuccess,
    showExitModal,
  ]);

  useEffect(() => {
    if (mounted && user?.tipologia_socio?.toUpperCase() === "STAFF") {
      localStorage.setItem("active_tab", activeTab);
    }
  }, [activeTab, mounted, user]);

  useEffect(() => {
    let html5QrCode;
    if (scanning && !manualInput) {
      const timer = setTimeout(() => {
        const element = document.getElementById("reader");
        if (element) {
          html5QrCode = new Html5Qrcode("reader");
          html5QrCode
            .start(
              { facingMode: "environment" },
              { fps: 15, qrbox: 280 },
              async (text) => {
                await html5QrCode.stop();
                setScanning(false);
                handleScanSuccess(text);
              },
            )
            .catch((err) => console.error(err));
        }
      }, 150);
    }
    return () => {
      if (html5QrCode?.isScanning) html5QrCode.stop().catch(() => {});
    };
  }, [scanning, manualInput]);

  if (!mounted) return <div className="min-h-screen bg-[#0f172a]" />;

  const isStaff = user?.tipologia_socio?.toUpperCase() === "STAFF";

  const filteredMembres = membres.filter((m) => {
    const matchesSearch = `${m.nome} ${m.cognome}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    if (filter === "ALL") return matchesSearch;
    if (filter === "STAFF")
      return matchesSearch && m.tipologia_socio?.toUpperCase() === "STAFF";
    if (filter === "VOLONTARIO")
      return matchesSearch && m.tipologia_socio?.toUpperCase() === "VOLONTARIO";
    if (filter === "ACCESSI") return matchesSearch && isAuthValid(m);
    return matchesSearch;
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* NAV BAR DESIGN "PILL" */}
        <nav className="bg-slate-900/90 border border-white/10 backdrop-blur-xl h-14 rounded-full px-2 flex items-center shadow-2xl sticky top-2 z-[90]">
          {/* CERCLE BLANC AVEC LOGO OTTIMIZZATO */}
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center ml-1 flex-shrink-0 shadow-lg overflow-hidden relative p-0.5">
            <Image
              src="/logo-unisp.png" // Assicurati che il nome sia corretto in /public
              alt="Logo UNISP"
              width={40} // Dimensioni di riferimento
              height={40}
              className="object-contain p-1"
              priority // Carica il logo immediatamente (importante per l'LCP)
            />
          </div>

          <div className="flex grow justify-center gap-6 px-2">
            <button
              onClick={() => setActiveTab("passages")}
              className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "passages" ? "text-blue-500 scale-110" : "text-slate-500"}`}
            >
              Passaggi
            </button>
            {isStaff && (
              <>
                <button
                  onClick={() => setActiveTab("membres")}
                  className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "membres" ? "text-blue-500 scale-110" : "text-slate-500"}`}
                >
                  Membri
                </button>
                <button
                  onClick={() => setActiveTab("stats")}
                  className={`text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "stats" ? "text-blue-500 scale-110" : "text-slate-500"}`}
                >
                  Stat
                </button>
              </>
            )}
          </div>

          {isStaff && activeTab === "membres" && (
            <button
              onClick={handleBulkSend}
              disabled={isProcessing}
              className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-90 shadow-lg shadow-blue-600/20 mr-1"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 rotate-45"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              )}
            </button>
          )}
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
          />
        ) : (
          <StatsView
            membres={membres}
            passaggi={storicoPassaggi}
            alimentiData={alimenti}
            setAlimenti={setAlimenti}
          />
        )}
      </div>

      {/* PULSANTE SCAN FLOTTANTE */}
      {!scanning && (
        <button
          onClick={startScanner}
          className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-xl z-50 active:scale-90 transition-transform border border-white/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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

      {/* MODALE DI SUCCESSO JOLIE */}
      {showSuccess && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300"
            onClick={() => setShowSuccess(false)}
          ></div>
          <div className="relative bg-[#1e293b] border border-white/10 w-full max-w-sm rounded-[3rem] p-10 text-center shadow-[0_0_50px_-12px_rgba(59,130,246,0.5)] animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="4"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-white font-black text-2xl uppercase tracking-tighter mb-2">
              Email Inviate!
            </h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Operazione completata con successo.
              <br />
              Abbiamo inviato{" "}
              <span className="text-blue-400 font-black">{countSent}</span>{" "}
              codici QR.
            </p>
            <button
              onClick={() => setShowSuccess(false)}
              className="w-full bg-blue-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
            >
              Ottimo!
            </button>
          </div>
        </div>
      )}

      {/* OVERLAYS (Scanner, Feedback, Alert, Dettagli) */}
      {scanning && (
        <div className="fixed inset-0 bg-[#0f172a] z-[200] flex flex-col items-center">
          <div className="p-6 w-full flex justify-between items-center bg-slate-900/80 text-white border-b border-white/5">
            <span className="font-black text-blue-500 text-[10px] tracking-widest uppercase">
              {manualInput ? "Inserimento Manuale" : "Scanner Attivo"}
            </span>
            <button
              onClick={() => {
                setScanning(false);
                setManualInput(false);
              }}
              className="bg-white/10 w-10 h-10 rounded-full text-2xl flex items-center justify-center"
            >
              &times;
            </button>
          </div>
          <div className="w-full grow flex flex-col items-center justify-center p-6">
            {!manualInput ? (
              <div className="w-full flex flex-col items-center">
                <div
                  id="reader"
                  className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10"
                ></div>
                <button
                  onClick={() => setManualInput(true)}
                  className="mt-10 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-blue-400 text-[10px] font-black uppercase tracking-widest"
                >
                  Codice Manuale
                </button>
              </div>
            ) : (
              <div className="glass w-full max-w-sm p-10 rounded-[3rem] border border-white/10 text-center space-y-6">
                <p className="text-slate-400 text-[10px] font-black uppercase">
                  Inserisci Codice QR
                </p>
                <input
                  type="text"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-4 py-5 text-white text-center font-black tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500"
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

      {feedback && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"></div>
          <div
            className={`relative ${feedback.bgColor} ${feedback.glowColor} w-full max-w-sm rounded-[3.5rem] p-10 shadow-[0_0_50px_-12px] border border-white/30 text-center`}
          >
            <div className="text-7xl mb-6">{feedback.icon}</div>
            <h3 className="text-white text-xs font-black uppercase tracking-widest mb-4">
              {feedback.name}
            </h3>
            <p className="text-white text-4xl font-black uppercase leading-none tracking-tighter mb-2">
              {feedback.message}
            </p>
            <button
              onClick={() => setFeedback(null)}
              className="mt-12 bg-white text-slate-900 px-10 py-4 rounded-full text-[11px] font-black uppercase tracking-widest"
            >
              Continua
            </button>
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

      {/* MODALE DI CONFERMA USCITA */}
      {showExitModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setShowExitModal(false)}
          ></div>
          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-sm rounded-[3rem] p-10 text-center shadow-2xl">
            <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
              <span className="text-4xl">🚪</span>
            </div>
            <h2 className="text-white font-black text-2xl uppercase tracking-tighter mb-2">
              Vuoi uscire?
            </h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Sei sicuro di voler chiudere la sessione di lavoro attuale?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  localStorage.removeItem("unisp_user");
                  window.location.href = "/"; // Forza il ritorno al login e pulisce la cronologia
                }}
                className="w-full bg-red-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-lg shadow-red-600/20 active:scale-95 transition-all"
              >
                Sì, Esci
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full bg-white/5 py-4 rounded-2xl font-black text-slate-300 uppercase tracking-widest border border-white/10 active:scale-95 transition-all"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMembre && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[400] flex items-center justify-center p-4">
          <div className="glass w-full max-w-md rounded-[2.5rem] border border-white/10 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-6 bg-[#1e293b] border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl text-white uppercase font-black">
                <span className="font-light">{selectedMembre.nome}</span>{" "}
                <span className="text-blue-500">{selectedMembre.cognome}</span>
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
                if (!v) return null;

                // Controlliamo se il valore è un link (inizia con http o https)
                const isLink = typeof v === "string" && v.startsWith("http");

                return (
                  <div
                    key={k}
                    className="bg-white/5 p-4 rounded-2xl border border-white/5"
                  >
                    <p className="text-[9px] uppercase text-blue-400 font-black mb-1">
                      {k.replace(/_/g, " ")}
                    </p>

                    {isLink ? (
                      <a
                        href={v}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-sm font-medium underline break-all hover:text-blue-300 transition-colors"
                      >
                        Visualizza Documento →
                      </a>
                    ) : (
                      <p className="text-slate-100 text-sm font-medium">
                        {String(v)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-6 border-t border-white/5">
              <button
                onClick={() => setSelectedMembre(null)}
                className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white uppercase tracking-widest"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
