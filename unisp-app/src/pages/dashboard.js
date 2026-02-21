import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/router";

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [passaggi, setPassaggi] = useState([]);
  const [membres, setMembres] = useState([]);
  const [activeTab, setActiveTab] = useState("passages");
  const [user, setUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [scanning, setScanning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [selectedMembre, setSelectedMembre] = useState(null);
  const [manualInput, setManualInput] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [modalAlert, setModalAlert] = useState(null);

  // --- FUNZIONI ---

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
      .order("cognome", { ascending: true }); // ORDINAMENTO PER COGNOME
    if (data) setMembres(data);
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
      .update({
        auth_scan_active: false,
        auth_scan_expires_at: null,
      })
      .eq("id", id);
    fetchMembres();
  };

  const handleScanSuccess = async (qrCode) => {
    const { data: membre } = await supabase
      .from("membres")
      .select("id, nome, cognome, stato")
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
    const s = membre.stato?.toUpperCase();
    if (s !== "ATTIVO") {
      let color = "bg-red-600/90";
      if (s === "SOSPESO") color = "bg-yellow-600/90";
      return showFeedback(nomComplet, color, s, "🔒");
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

    await supabase.from("passaggi").insert([{ membre_id: membre.id }]);
    setTimeout(async () => {
      const { data: finalData } = await supabase
        .from("passaggi")
        .select("numero_giornaliero")
        .eq("membre_id", membre.id)
        .gt("scanned_at", startOfDay.toISOString())
        .single();
      showFeedback(
        nomComplet,
        "bg-green-500/90",
        `ENTRATA VALIDA N° ${finalData?.numero_giornaliero || "??"}`,
        "✅",
      );
      fetchPassaggiOggi();
    }, 200);
  };

  const showFeedback = (name, bgColor, message, icon) => {
    let glowColor = "shadow-blue-500/50";
    if (bgColor.includes("green")) glowColor = "shadow-green-500/50";
    if (bgColor.includes("red")) glowColor = "shadow-red-500/50";
    setFeedback({ name, bgColor, message, icon, glowColor });
    setTimeout(() => setFeedback(null), 4000);
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
    const init = async () => {
      // On décale légèrement l'exécution pour éviter le rendu en cascade synchrone
      setMounted(true);

      const savedTab = localStorage.getItem("active_tab");
      if (savedTab) setActiveTab(savedTab);

      const storedUser = localStorage.getItem("unisp_user");
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        // On charge les membres seulement après avoir confirmé qu'il est STAFF
        if (parsed?.tipologia_socio?.toUpperCase() === "STAFF") {
          fetchMembres();
        }
      }

      fetchPassaggiOggi();
    };

    init();

    const interval = setInterval(fetchPassaggiOggi, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("active_tab", activeTab);
  }, [activeTab, mounted]);

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

  // --- LOGICA FILTRAGGIO ---
  const filteredMembres = membres.filter((m) => {
    const matchesSearch = `${m.nome} ${m.cognome}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const now = new Date();
    const isAuthValid =
      m.auth_scan_active && new Date(m.auth_scan_expires_at) > now;

    if (filter === "ALL") return matchesSearch;
    if (filter === "STAFF")
      return matchesSearch && m.tipologia_socio?.toUpperCase() === "STAFF";
    if (filter === "VOLONTARIO")
      return matchesSearch && m.tipologia_socio?.toUpperCase() === "VOLONTARIO";
    if (filter === "ACCESSI") return matchesSearch && isAuthValid;
    return matchesSearch;
  });

  return (
    <Layout>
      <div className="space-y-6">
        <nav className="flex justify-around mb-6 border-slate-800">
          <button
            onClick={() => setActiveTab("passages")}
            className={`pb-3 px-6 font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === "passages" ? "border-b-2 border-blue-500 text-blue-500" : "text-slate-500"}`}
          >
            Passaggi
          </button>
          {user?.tipologia_socio?.toUpperCase() === "STAFF" && (
            <button
              onClick={() => setActiveTab("membres")}
              className={`pb-3 px-6 font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === "membres" ? "border-b-2 border-blue-500 text-blue-500" : "text-slate-500"}`}
            >
              Admin
            </button>
          )}
        </nav>

        {activeTab === "passages" ? (
          <div className="space-y-3">
            {passaggi.length === 0 ? (
              <p className="text-center text-slate-600 py-10 italic">
                Nessun passaggio oggi
              </p>
            ) : (
              passaggi.map((p) => (
                <div
                  key={p.id}
                  className="glass p-4 rounded-2xl flex justify-between items-center border-l-4 border-blue-500 shadow-lg bg-white/5"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm">
                      {p.membres?.nome} {p.membres?.cognome}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(p.scanned_at).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span className="bg-blue-600 text-white text-[11px] px-3 py-1 rounded-lg font-black italic">
                    N° {p.numero_giornaliero}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <h1 className="text-white font-black text-2xl uppercase tracking-tighter">
              Membri
            </h1>
            <input
              type="text"
              placeholder="Cerca nome o cognome..."
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold"
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

            <div className="space-y-3">
              {filteredMembres.map((m) => {
                const s = m.stato?.toUpperCase() || "INATTIVO";
                const isAuth =
                  m.auth_scan_active &&
                  new Date(m.auth_scan_expires_at) > new Date();
                const isCompactMode =
                  filter === "VOLONTARIO" || filter === "ACCESSI";

                let bStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                let dotColor = "bg-blue-500";
                if (s === "ATTIVO") {
                  bStyle = "bg-green-500/10 text-green-400 border-green-500/20";
                  dotColor = "bg-green-500";
                } else if (s === "SOSPESO") {
                  bStyle =
                    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                  dotColor = "bg-yellow-500";
                } else if (s === "ESCLUSO") {
                  bStyle = "bg-red-500/10 text-red-400 border-red-500/20";
                  dotColor = "bg-red-500";
                }

                return (
                  <div
                    key={m.id}
                    className="glass p-5 rounded-[2rem] border border-white/5 shadow-xl"
                  >
                    <div className="flex justify-between items-center">
                      <div
                        className="cursor-pointer flex flex-col"
                        onClick={() => setSelectedMembre(m)}
                      >
                        <span className="text-white font-light uppercase text-sm leading-tight">
                          {m.nome}
                        </span>
                        <span className="text-blue-500 font-black uppercase text-sm leading-tight">
                          {m.cognome}
                        </span>
                        {!isCompactMode && (
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">
                            {m.tipologia_socio}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center">
                        {isCompactMode ? (
                          s !== "ATTIVO" ? (
                            <div
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bStyle} backdrop-blur-md`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotColor}`}
                              ></span>
                              <span className="text-[10px] font-black uppercase leading-none">
                                {s}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                isAuth
                                  ? revokeVolontaire(m.id)
                                  : authorizeVolontaire(m.id)
                              }
                              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAuth ? "bg-red-500/10 text-red-500 border border-red-500/20" : "bg-blue-600 text-white shadow-lg shadow-blue-600/30"}`}
                            >
                              {isAuth ? "REVOCA" : "SCAN"}
                            </button>
                          )
                        ) : (
                          <div
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bStyle} backdrop-blur-md`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotColor}`}
                            ></span>
                            <span className="text-[10px] font-black uppercase leading-none">
                              {s}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
                  ].includes(k)
                )
                  return null;
                if (!v) return null;
                return (
                  <div
                    key={k}
                    className="bg-white/5 p-4 rounded-2xl border border-white/5"
                  >
                    <p className="text-[9px] uppercase text-blue-400 font-black mb-1">
                      {k.replace(/_/g, " ")}
                    </p>
                    <p className="text-slate-100 text-sm font-medium">
                      {String(v)}
                    </p>
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
