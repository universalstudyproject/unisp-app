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
import DistribuzioneView from "@/components/dashboard/DistribuzioneView";

export default function Dashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [prenotazioni, setPrenotazioni] = useState([]);
  const [membres, setMembres] = useState([]);
  const [singleEmailTarget, setSingleEmailTarget] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("unisp_active_tab") || "dashboard";
    }
    return "dashboard";
  });
  const [user, setUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [alimenti, setAlimenti] = useState([]);
  const [storicoPassaggi, setStoricoPassaggi] = useState([]);
  const [showExitModal, setShowExitModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [showMassEmailModal, setShowMassEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({
    subject: "",
    message: "",
  });

  const [filters, setFilters] = useState({
    stati: [],
    ruoli: [],
  });

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

  const triggerAutoEmail = async (newMembersCount) => {
    if (newMembersCount <= 0) return;

    // 1. Log iniziale: Segnaliamo che partiamo con l'invio massivo
    await createLog(
      "EMAIL_AUTO_TRIGGER",
      `Inizio invio a lotti per ${newMembersCount} nuovi membri.`,
    );

    let isFinished = false;
    let totalSent = 0;

    // 2. Ciclo di invio a lotti (Batching)
    // Continua a chiamare l'API finché il server non risponde "finished: true"
    while (!isFinished) {
      try {
        console.log(
          `[LOG] Richiesta batch in corso... Inviati finora: ${totalSent}`,
        );

        const res = await fetch("/api/send-bulk-qr", {
          method: "POST",
          // Nota: keepalive è utile, ma qui usiamo await perché il processo è lungo
          // e vogliamo monitorare ogni passo.
          keepalive: true,
        });

        const data = await res.json();

        if (data.success) {
          totalSent += data.count;

          if (data.finished) {
            // Caso: Tutte le email sono state inviate
            isFinished = true;
            console.log(
              `[LOG] 🎉 Invio completato con successo. Totale: ${totalSent}`,
            );
            await createLog(
              "EMAIL_AUTO_SENT",
              `Completato! Inviati correttamente ${totalSent} QR Code.`,
            );
          } else {
            // Caso: Ci sono ancora email, facciamo una piccola pausa per Gmail
            console.log(`[LOG] Batch di ${data.count} inviato. Pausa di 1s...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          // Caso: L'API ha restituito un errore
          isFinished = true;
          console.error("[LOG] ❌ Errore durante il batch:", data.error);
          await createLog(
            "EMAIL_AUTO_ERROR",
            `Errore durante l'invio batch: ${data.error}`,
          );
        }
      } catch (err) {
        // Caso: Errore di connessione o crash
        isFinished = true;
        console.error("[LOG] ❌ Crash connessione API:", err);
        await createLog(
          "EMAIL_AUTO_CRASH",
          `Connessione interrotta: ${err.message}`,
        );
      }
    }

    // 3. Aggiornamento finale della lista membri nella UI
    fetchMembres();
  };

  // Fonction pour ajouter un file à la liste (dans ton input onChange)
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  // Fonction pour supprimer un file spécifique de la liste
  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartMassSending = async () => {
    // CALCOLO TARGET PER IL MODALE EMAIL
    const membriTarget = singleEmailTarget
      ? [singleEmailTarget] // <-- Mode "Un seul membre"
      : membres.filter((m) => {
          // <-- Mode "Massif"
          const matchStato =
            filters.stati.length === 0 ||
            filters.stati.includes(m.stato?.toUpperCase());
          const matchRuolo =
            filters.ruoli.length === 0 ||
            filters.ruoli.includes(m.tipologia_socio?.toUpperCase());
          return matchStato && matchRuolo;
        });

    // Validazione Target con Modal
    if (membriTarget.length === 0) {
      setModalAlert({
        title: "NESSUN TARGET",
        message: "Nessun membro corrisponde ai filtri selezionati.",
        icon: (
          <svg
            className="w-10 h-10 mx-auto mb-4 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        ),
      });
      return;
    }

    // Validazione Campi con Modal
    if (!emailForm.subject || !emailForm.message) {
      setModalAlert({
        title: "CAMPI MANCANTI",
        message: "Inserisci oggetto e messaggio prima di inviare.",
        icon: (
          <svg
            className="w-10 h-10 mx-auto mb-4 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
            />
          </svg>
        ),
      });
      return;
    }

    // Conferma Invio con Modal Designer
    setConfirmAction({
      title: "AVVIA INVIO MASSIVO",
      message: `Stai per inviare questa e-mail a ${membriTarget.length} persone. Procedere?`,
      icon: (
        <svg
          className="w-10 h-10 mx-auto mb-4 text-blue-400 drop-shadow-[0_0_20px_rgba(96,165,250,0.7)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
          />
        </svg>
      ),
      color: "blue",
      onConfirm: async () => {
        setConfirmAction(null);
        setShowMassEmailModal(false);
        setIsProcessing(true);

        let allegatoUrl = null;

        let allegatiUrls = [];
        try {
          // 2. CARICAMENTO FILE
          if (selectedFiles.length > 0) {
            setFeedback({
              type: "loading",
              message: `Caricamento di ${selectedFiles.length} file...`,
              name: "UPLOAD IN CORSO",
            });

            for (const file of selectedFiles) {
              const fileName = `comunicazioni/${Date.now()}_${file.name}`;
              const { error: uploadError } = await supabase.storage
                .from("tessere")
                .upload(fileName, file);

              if (!uploadError) {
                const {
                  data: { publicUrl },
                } = supabase.storage.from("tessere").getPublicUrl(fileName);
                allegatiUrls.push(publicUrl);
              }
            }
          }

          // 3. INVIO SEQUENZIALE
          let counter = 0;
          for (const m of membriTarget) {
            setFeedback({
              type: "loading",
              message: `Invio: ${counter + 1} di ${membriTarget.length}`,
              name: `${m.nome} ${m.cognome}`,
              bgColor: "bg-blue-600",
            });

            await fetch("/api/send-custom-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: m.email,
                nomeMembro: m.nome,
                subject: emailForm.subject,
                message: emailForm.message.replace(/{nome}/g, m.nome),
                allegatiUrls: allegatiUrls,
              }),
            });

            counter++;
            if (counter < membriTarget.length) {
              await new Promise((r) => setTimeout(r, 5000));
            }
          }

          setFeedback({
            type: "success",
            message: `Inviate ${counter} email con successo!`,
            icon: (
              <svg
                className="w-16 h-16 text-emerald-400 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ),
            bgColor: "bg-emerald-600",
          });
        } catch (err) {
          console.error("Errore:", err);
          setFeedback({
            type: "error",
            message: "Errore durante l'invio.",
            icon: (
              <svg
                className="w-16 h-16 text-white mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            ),
            bgColor: "bg-red-600",
          });
        } finally {
          setIsProcessing(false);
          setSelectedFiles([]);
          setFilters({ stati: [], ruoli: [] });
          setSingleEmailTarget(null);
        }
      },
    });
  }; // <--- LA FUNZIONE FINISCE QUI. NON DEVE ESSERCI NULLA TRA QUESTO E 'generateAllCards'

  const generateAllCards = async () => {
    // Filtriamo solo i membri ATTIVI che non hanno ancora la tessera (opzionale)
    const membriDaProcessare = membres.filter(
      (m) => m.stato === "ATTIVO" && (!m.tessera_url || m.tessera_url === ""),
    );

    if (membriDaProcessare.length === 0) {
      // Feedback specifico se tutti hanno già la tessera
      setFeedback({
        type: "info",
        name: "TUTTO AGGIORNATO",
        message: "Tutti i membri attivi possiedono già una tessera socio.",
        icon: (
          <svg
            className="w-16 h-16 text-blue-300 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
        bgColor: "bg-blue-600",
      });
      return;
    }

    setIsProcessing(true);
    let processati = 0;

    // VERSION ULTRA-RAPIDE (Lots de 3)
    for (let i = 0; i < membriDaProcessare.length; i += 3) {
      // On prend un groupe de 3 membres
      const batch = membriDaProcessare.slice(i, i + 3);

      setFeedback({
        type: "loading",
        message: `Generazione in corso: ${i + 1} di ${membriDaProcessare.length}...`,
      });

      // On lance les 3 requêtes en même temps
      await Promise.all(
        batch.map(async (membro) => {
          try {
            const res = await fetch("/api/generate-single-card", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ memberId: membro.id }),
            });
            const data = await res.json();
            if (data.success) processati++;
          } catch (err) {
            console.error(`Errore per ${membro.nome}:`, err);
          }
        }),
      );

      // Petite pause de sécurité de 2 secondes entre chaque groupe de 3
      if (i + 3 < membriDaProcessare.length) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    setIsProcessing(false);
    setFeedback({
      type: "success",
      name: "PROCESSO COMPLETATO",
      message: `Inviate ${processati} tessere su ${membriDaProcessare.length}`,
      icon: (
        <svg
          className="w-16 h-16 text-emerald-300 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
      bgColor: "bg-emerald-600",
    });

    fetchMembres(); // Rinfresca la lista per vedere i nuovi URL
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

  const fetchPrenotazioniOggi = async () => {
    const { data, error } = await supabase
      .from("prenotazioni")
      .select(`id, scanned_at, numero_giornaliero, membres ( nome, cognome )`)
      .order("scanned_at", { ascending: false });

    if (error) {
      console.error("Erreur de chargement des prenotazioni:", error); 
    }
    if (data) setPrenotazioni(data);
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

  // LA LOGIQUE "PULL" : À chaque fois qu'on ouvre l'onglet STATS, on télécharge les données fraîches !
  useEffect(() => {
    if (activeTab === "dashboard" && user) {
      const fetchFreshStats = async () => {
        // 1. On charge les membres (pour les graphiques d'âge, étudiants, etc.)
        fetchMembres();

        // 1. On va chercher les derniers aliments
        const { data: alimentiFreschi } = await supabase
          .from("alimenti")
          .select("*");
        if (alimentiFreschi) setAlimenti(alimentiFreschi);

        // 2. On peut même en profiter pour rafraîchir l'historique des passages !
        const { data: passaggiFreschi } = await supabase
          .from("passaggi")
          .select("nome_cognome, scanned_at");
        if (passaggiFreschi) setStoricoPassaggi(passaggiFreschi);
      };

      fetchFreshStats();
    }
  }, [activeTab, user]); // S'active à chaque fois que 'activeTab' change

  useEffect(() => {
    if (activeTab !== "passages") {
      window.history.pushState(
        { tab: activeTab },
        null,
        window.location.pathname,
      );
    }
  }, [activeTab]);

  // Sauvegarde l'onglet à chaque changement
  useEffect(() => {
    localStorage.setItem("unisp_active_tab", activeTab);
  }, [activeTab]);

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

  const handleSingleCardGeneration = async (member) => {
    setFeedback({ type: "loading", message: "Generazione in corso..." });

    try {
      // 1. Chiamata a un'API specifica per il singolo (o usiamo la stessa passando l'ID)
      const res = await fetch("/api/generate-single-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });

      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: "success",
          name: "OPERAZIONE RIUSCITA",
          message: "Tessera generata e inviata correttamente!",
          icon: (
            <svg
              className="w-16 h-16 text-white mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ),
          bgColor: "bg-emerald-600",
        });
        fetchMembres(); // Rinfresca i dati per vedere il link in "TESSERA URL"
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setFeedback({ type: "error", message: "Errore: " + err.message });
    }
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
    // 1. Cerchiamo il membro tramite QR
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
        icon: (
          <svg
            className="w-16 h-16 text-red-500 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636"
            />
          </svg>
        ),
      });

    const nomComplet = `${membre.nome} ${membre.cognome}`;

    if (membre.stato?.toUpperCase() !== "ATTIVO")
      return setFeedback({
        name: nomComplet,
        bgColor: "bg-red-600",
        message: membre.stato.toUpperCase(),
        icon: (
          <svg
            className="w-16 h-16 text-white mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        ),
      });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 2. Controllo se è già passato oggi
    const { data: check } = await supabase
      .from("prenotazioni")
      .select("numero_giornaliero")
      .eq("membre_id", membre.id)
      .gt("scanned_at", startOfDay.toISOString())
      .maybeSingle();

    if (check)
      return setFeedback({
        name: nomComplet,
        bgColor: "bg-blue-500",
        message: `GIÀ PASSATO: N° ${check.numero_giornaliero}`,
        icon: (
          <svg
            className="w-16 h-16 text-white mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
      });

    // 3. Registriamo il nuovo passaggio e CHIEDIAMO di restituire il numero generato
    // ... dopo aver validato il membro
    const { data: newPrenotazione, error: insErr } = await supabase
      .from("prenotazioni")
      .insert([{ membre_id: membre.id }])
      .select("numero_giornaliero")
      .single();

    if (!insErr && newPrenotazione) {
      const numero = newPrenotazione.numero_giornaliero;

      // 4. Scriviamo il Log
      await createLog(
        "SCAN_SUCCESS",
        `Ingresso registrato: N° ${numero}`,
        membre.id,
        nomComplet,
      );

      // 5. AGGIORNAMENTO: Invio email di conferma con numero e data
      fetch("/api/notify-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: membre.email,
          nome: membre.nome,
          numero_giornaliero: numero,
        }),
      }).catch((e) => console.error("Errore invio email conferma:", e));

      // 6. Refresh lista locale
      fetchPrenotazioniOggi();

      // 7. Feedback a schermo con il numero (ripristinato)
      setFeedback({
        name: nomComplet,
        bgColor: "bg-green-600",
        message: `ENTRATA VALIDA: N° ${numero}`, // Mostra il numero nella notifica
        icon: (
          <svg
            className="w-16 h-16 text-white mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ),
      });

      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const reSendSingleEmail = async (m) => {
    // Feedback visivo immediato
    setFeedback({ type: "loading", message: `Invio in corso a ${m.nome}...` });

    try {
      const res = await fetch("/api/send-single-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: m.id }),
      });

      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: "success",
          message: `Email inviata con successo!`,
        });
        await createLog(
          "EMAIL_SINGLE_SENT",
          `Inviato manualmente QR a ${m.nome} ${m.cognome}`,
        );
      } else {
        throw new Error(data.message || "Errore durante l'invio");
      }
    } catch (err) {
      setFeedback({ type: "error", message: `Errore: ${err.message}` });
    }
  };

  const handleLogout = async () => {
    await createLog("LOGOUT", "Uscita dal sistema");
    localStorage.removeItem("unisp_user");
    localStorage.removeItem("unisp_active_tab");
    window.location.href = "/";
  };

  useEffect(() => {
    let scanner = null;
    let isMounted = true; // Sécurité pour éviter de mettre à jour l'état si le composant est fermé

    if (scanning && !manualInput) {
      scanner = new Html5Qrcode("reader");
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (isMounted) {
              handleScanSuccess(decodedText);
              setScanning(false);
            }
          },
          (error) => {
            // On ignore les erreurs de scan continu
          },
        )
        .catch((err) => console.error("Erreur caméra:", err));
    }

    return () => {
      isMounted = false;
      if (scanner) {
        try {
          // On vérifie que le scanner est bien actif avant de l'arrêter
          if (scanner.isScanning) {
            scanner
              .stop()
              .catch((err) => console.log("Arrêt scanner ignoré:", err));
          }
        } catch (err) {
          // On étouffe l'erreur si la librairie se plaint "Cannot stop..."
          console.log("Le scanner n'était pas encore prêt à être arrêté.");
        }
      }
    };
  }, [scanning, manualInput]);

  const startScanner = async () => {
    // 1. Recuperiamo la tipologia locale per fare una prima scrematura
    const tipologia = user?.tipologia_socio?.toUpperCase();

    // 2. Se sei ADMIN o STAFF, apri subito la camera (non li facciamo aspettare)
    if (tipologia === "ADMIN" || tipologia === "STAFF") {
      setManualInput(false);
      setScanning(true);
      return;
    }

    // 3. Se sei VOLONTARIO, facciamo il controllo LIVE su Supabase (Just-in-Time!)
    if (tipologia === "VOLONTARIO") {
      try {
        // Interroghiamo il DB in tempo reale
        const { data, error } = await supabase
          .from("membres")
          .select("auth_scan_active, auth_scan_expires_at, tipologia_socio")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        // Aggiorniamo la memoria del telefono e lo stato React in silenzio
        const updatedUser = { ...user, ...data };
        localStorage.setItem("unisp_user", JSON.stringify(updatedUser));
        setUser(updatedUser);

        // Ora usiamo i dati APPENA SCARICATI per verificare se può scansionare
        if (isAuthValid(updatedUser)) {
          setManualInput(false);
          setScanning(true);
        } else {
          setModalAlert({
            title: "ACCESSO NEGATO",
            message:
              "Autorizzazione scaduta o non attiva. Contatta l'amministratore.",
            icon: (
              <svg
                className="w-10 h-10 mx-auto mb-4 text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.7)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            ),
          });
        }
      } catch (err) {
        console.error("Errore verifica live volontario:", err);
        alert("Errore di connessione. Riprova.");
      }
      return;
    }

    // 4. Per tutti gli altri (PASSIVO, SCONOSCIUTO, ecc.), blocca e NON aprire nulla
    setModalAlert({
      title: "NON AUTORIZZATO",
      message:
        "Solo lo staff e i volontari autorizzati possono usare lo scanner.",
      icon: (
        <svg
          className="w-10 h-10 mx-auto mb-4 text-red-400 drop-shadow-[0_0_20px_rgba(248,113,113,0.7)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      ),
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
    const ruolo = parsed?.tipologia_socio?.toUpperCase();

    // 1. TOUT LE MONDE (Staff, Admin ET Volontaires) a besoin de voir les passages d'aujourd'hui
    if (["STAFF", "ADMIN", "VOLONTARIO"].includes(ruolo)) {
      fetchPrenotazioniOggi();
    }

    // 2. SEULS les Staff et Admin téléchargent les données lourdes et sensibles (Membres complets, Historique, etc.)
    if (["STAFF", "ADMIN"].includes(ruolo)) {
      fetchMembres();
      supabase
        .from("alimenti")
        .select("*")
        .then(({ data }) => setAlimenti(data));
      supabase
        .from("passaggi")
        .select("nome_cognome, scanned_at")
        .then(({ data }) => setStoricoPassaggi(data));
    }
  }, []);

  useEffect(() => {
    const handleBackButton = (e) => {
      // Se c'è un modale aperto, lo chiudiamo e impediamo l'uscita dall'app
      if (
        selectedMembre ||
        showLogModal ||
        showExitModal ||
        scanning ||
        feedback ||
        showMassEmailModal
      ) {
        e.preventDefault();

        if (showMassEmailModal) {
          setShowMassEmailModal(false);
          setShowLogModal(true);
        } else {
          setSelectedMembre(null);
          setShowLogModal(false);
          setShowExitModal(false);
          setScanning(false);
          setFeedback(null);
        }

        // Reinseriamo uno stato fittizio per "riprendere" il controllo del tasto indietro
        window.history.pushState(null, null, window.location.pathname);
      }
    };

    // Quando apriamo un modale, spingiamo uno stato nella cronologia
    if (
      selectedMembre ||
      showLogModal ||
      showExitModal ||
      scanning ||
      feedback
    ) {
      window.history.pushState(null, null, window.location.pathname);
    }

    window.addEventListener("popstate", handleBackButton);

    return () => {
      window.removeEventListener("popstate", handleBackButton);
    };
  }, [selectedMembre, showLogModal, showExitModal, scanning, feedback]);

  if (!mounted) return null;
  const isStaff =
    user?.tipologia_socio?.toUpperCase() === "STAFF" ||
    user?.tipologia_socio?.toUpperCase() === "ADMIN";
  const isAdmin = user?.tipologia_socio?.toUpperCase() === "ADMIN";

  // LOGICA FILTRI DELLA LISTA ADMIN (Ricerca testuale e bottoni rapidi)
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
    if (filter === "ACCESSI") return matchesSearch && isAuthValid(m);
    return matchesSearch;
  }); // <-- ATTENZIONE: Questo chiude il filtro della barra di ricerca

  // CALCOLO TARGET PER IL MODALE EMAIL (Basato sulle checkbox cliccate)
  const membriTarget = membres.filter((m) => {
    const matchStato =
      filters.stati.length === 0 ||
      filters.stati.includes(m.stato?.toUpperCase());
    const matchRuolo =
      filters.ruoli.length === 0 ||
      filters.ruoli.includes(m.tipologia_socio?.toUpperCase());
    return matchStato && matchRuolo;
  });

  // QUI INIZIA LA UI
  return (
    <Layout
      onLogoutClick={() => setShowExitModal(true)}
      onAdminClick={() => {
        setShowLogModal(true);
        setShowMassEmailModal(false); // Ferme le mail
        setSingleEmailTarget(null); // Oublie le destinataire
        setSelectedMembre(null);
        setConfirmAction(null);
      }}
      onMembriClick={() => {
        setActiveTab("membres");
        setShowMassEmailModal(false); // Ferme le mail
        setSingleEmailTarget(null); // Oublie le destinataire
        setShowLogModal(false);
        setConfirmAction(null);
        setSelectedMembre(null);
      }}
      onStatsClick={() => {
        setActiveTab("stats");
        setShowLogModal(false);
        setSelectedMembre(null);
        setShowMassEmailModal(false); // Ferme le mail
        setSingleEmailTarget(null); // Oublie le destinataire
        setConfirmAction(null);
      }}
    >
      <div className="space-y-6">
        <nav className="bg-slate-900/90 border border-white/10 backdrop-blur-xl h-14 rounded-full px-2 flex items-center shadow-2xl sticky top-2 z-[90]">
          {/* LOGO DEVIENT LE BOUTON DASHBOARD */}
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-10 h-10 rounded-full bg-white flex items-center justify-center ml-1 flex-shrink-0 shadow-lg p-0.5 overflow-hidden transition-all active:scale-90 ${activeTab === "dashboard" ? "ring-2 ring-blue-500" : ""}`}
          >
            <Image
              src="/logo-unisp.png"
              alt="Home"
              width={40}
              height={40}
              className="object-contain p-1"
              priority
            />
          </button>

          <div className="flex grow justify-center gap-6 px-4">
            {/* PRENOTAZIONI -> SCANS */}
            <button
              onClick={() => setActiveTab("passages")}
              className={`text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === "passages" ? "text-blue-500" : "text-slate-500 hover:text-slate-300"}`}
            >
              Prenotazioni
            </button>

            {/* DISTRIBUZIONE -> STOCK */}
            <button
              onClick={() => setActiveTab("distribuzione")}
              className={`text-[10px] font-black uppercase tracking-widest transition-colors ${activeTab === "distribuzione" ? "text-blue-500" : "text-slate-500 hover:text-slate-300"}`}
            >
              Distribuzione
            </button>
          </div>
        </nav>

        {/* LOGICA D'AFFICHAGE DES ONGLETS */}
        {activeTab === "dashboard" ? (
          <StatsView
            membres={membres}
            passaggi={storicoPassaggi}
            alimentiData={alimenti}
            currentUser={user}
          />
        ) : activeTab === "passages" ? (
          <PassaggiView passaggi={prenotazioni} />
        ) : activeTab === "distribuzione" ? (
          <DistribuzioneView
            prenotazioni={prenotazioni}
            user={user}
            membres={membres}
          />
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
        ) : null}
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

      {/* MODALE PANNELLO ADMIN */}
      {showLogModal && (
        <div className="fixed inset-0 z-[1000] flex items-start pt-28 justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setShowLogModal(false)}
          ></div>
          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl">
            <h2 className="text-white font-black text-center uppercase tracking-[0.2em] mb-8 text-sm">
              Pannello Admin
            </h2>

            {/* SEZIONE AZIONI RAPIDE */}
            <div className="flex flex-col gap-3 mb-10">
              <button
                onClick={() => {
                  setShowLogModal(false);
                  setShowMassEmailModal(true);
                }}
                className="w-full bg-blue-600/10 border border-blue-500/30 py-4 rounded-2xl font-black text-blue-400 uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Invia Email Massive
              </button>

              <button
                onClick={() =>
                  setConfirmAction({
                    title: "Genera PDF",
                    message: `Verrà generato un documento PDF con le tessere fedeltà di tutti i membri attivi.`,
                    icon: (
                      <svg
                        className="w-10 h-10 mx-auto mb-4 text-purple-400 drop-shadow-[0_0_20px_rgba(168,85,247,0.7)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                        />
                      </svg>
                    ),
                    color: "purple",
                    onConfirm: () => {
                      generateAllCards();
                      setConfirmAction(null);
                    },
                  })
                }
                className="w-full bg-purple-600/10 border border-purple-500/30 py-4 rounded-2xl font-black text-purple-400 uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                  />
                </svg>
                Genera Carte Fedeltà
              </button>
            </div>

            {/* SEZIONE LOG REGISTRI */}
            <div className="border-t border-white/5 pt-6">
              <p className="text-slate-500 font-bold text-[9px] uppercase text-center mb-4 tracking-widest">
                Esporta logs
              </p>

              <div className="grid grid-cols-3 gap-2 mb-6">
                {monthsList.map((month, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleMonth(idx)}
                    className={`py-2 rounded-xl text-[9px] font-bold border transition-all ${
                      selectedMonths.includes(idx)
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                        : "bg-white/5 border-white/10 text-slate-500"
                    }`}
                  >
                    {month.substring(0, 3)}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    if (selectedMonths.length === 0) {
                      setConfirmAction({
                        title: "Mese Mancante",
                        message:
                          "Seleziona almeno un mese dalla griglia qui sotto per scaricare i log.",
                        icon: (
                          <svg
                            className="w-10 h-10 mx-auto mb-4 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                        ),
                        color: "amber",
                        onConfirm: () => setConfirmAction(null),
                      });
                      return;
                    }
                    setConfirmAction({
                      title: "Download Log",
                      message: `Stai per scaricare i registri attività per i mesi selezionati.`,
                      icon: (
                        <svg
                          className="w-10 h-10 mx-auto mb-4 text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.7)]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                          />
                        </svg>
                      ),
                      color: "emerald",
                      onConfirm: () => {
                        downloadMonthlyLogs();
                        setConfirmAction(null);
                      },
                    });
                  }}
                  className="w-full bg-emerald-600 py-4 rounded-2xl font-black text-white uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-900/20"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Scarica file log
                </button>

                {/* Bottone Chiudi (senza icona per pulizia visiva) */}
                <button
                  onClick={() => setShowLogModal(false)}
                  className="w-full bg-white/5 py-4 rounded-2xl font-black text-slate-400 uppercase text-[10px] border border-white/10 active:scale-95 transition-all"
                >
                  Chiudi
                </button>
              </div>
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
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[400] flex items-start pt-25 justify-center p-4">
          <div className="glass w-full max-w-md rounded-[2.5rem] border border-white/10 flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-6 bg-[#1e293b] border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl uppercase flex gap-2 flex-wrap justify-center">
                <span className="text-blue-500 font-light">
                  {selectedMembre.nome}
                </span>
                <span className="text-white font-black">
                  {selectedMembre.cognome}
                </span>
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
                        className="text-green-500 text-sm font-medium break-all"
                      >
                        Vedi Documento
                      </a>
                    ) : k === "telefono" && v ? (
                      <button
                        onClick={() =>
                          setConfirmAction({
                            title: "Chiamata Rapida",
                            message: `Vuoi avviare una telefonata verso ${selectedMembre.nome} ${selectedMembre.cognome}?`,
                            icon: (
                              <svg
                                className="w-10 h-10 mx-auto mb-4 text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.387a12.035 12.035 0 01-7.108-7.108c-.155-.441.011-.928.387-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                                />
                              </svg>
                            ),
                            color: "blue",
                            onConfirm: () => {
                              window.location.href = `tel:${v}`;
                              setConfirmAction(null);
                            },
                          })
                        }
                        className="text-blue-400 text-sm font-bold hover:text-blue-300 transition-colors group"
                      >
                        {v}
                      </button>
                    ) : k === "email" && v ? (
                      <button
                        onClick={() =>
                          setConfirmAction({
                            title: "Invia Email",
                            message: `Aprire il client di posta per scrivere a ${v}?`,
                            icon: (
                              <svg
                                className="w-10 h-10 mx-auto mb-4 text-blue-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1.5"
                                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                                />
                              </svg>
                            ),
                            color: "blue",
                            onConfirm: () => {
                              setConfirmAction(null);
                              setSingleEmailTarget(selectedMembre);
                              setShowMassEmailModal(true);
                            },
                          })
                        }
                        className="text-blue-400 text-sm font-bold hover:text-blue-300 transition-colors group break-all text-left"
                      >
                        {v}
                      </button>
                    ) : (
                      <p className="text-slate-100 text-sm font-medium">
                        {String(v || "-")}
                      </p>
                    )}
                  </div>
                );
              })}
              {/* SEZIONE AZIONI TESSERA SINGOLA */}
              <div className="mt-6">
                {selectedMembre.stato === "ATTIVO" && (
                  <button
                    onClick={() =>
                      setConfirmAction({
                        title: "Genera e Invia",
                        message: `Vuoi generare la tessera per ${selectedMembre.nome} e inviarla subito via email?`,
                        icon: (
                          <svg
                            className="w-12 h-12 mx-auto text-purple-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                            />
                          </svg>
                        ),
                        color: "purple",
                        onConfirm: () => {
                          handleSingleCardGeneration(selectedMembre);
                          setConfirmAction(null);
                        },
                      })
                    }
                    className="w-full bg-purple-600/10 border border-purple-500/30 py-4 rounded-2xl font-black text-purple-400 uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                      />
                    </svg>
                    Genera e Invia Tessera
                  </button>
                )}
              </div>
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

      {/* FEEDBACK SCANNER / GENERAZIONE / INVIO */}
      {feedback && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
            // Permettiamo di chiudere cliccando fuori SOLO se non sta caricando
            onClick={() => feedback.type !== "loading" && setFeedback(null)}
          ></div>

          <div
            className={`relative ${feedback.bgColor || "bg-slate-900"} w-full max-w-sm rounded-[3.5rem] p-10 shadow-2xl border border-white/30 text-center transition-all`}
          >
            {/* ICONA O SPINNER */}
            <div className="text-7xl mb-6 flex justify-center">
              {feedback.type === "loading" ? (
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                feedback.icon
              )}
            </div>

            {/* NOME DEL MEMBRO O TITOLO OPERAZIONE */}
            <h3 className="text-white text-xs font-black uppercase mb-4 opacity-70">
              {feedback.name}
            </h3>

            {/* MESSAGGIO DI STATO */}
            <p className="text-white text-2xl font-black uppercase tracking-tighter mb-2 leading-none">
              {feedback.message}
            </p>

            {/* TASTO CONTINUA: Appare solo se l'operazione è FINITA (success o error) */}
            {feedback.type !== "loading" ? (
              <button
                onClick={() => setFeedback(null)}
                className="mt-12 bg-white text-slate-900 px-10 py-4 rounded-full text-[11px] font-black uppercase shadow-xl active:scale-95 transition-transform"
              >
                Continua
              </button>
            ) : (
              <p className="mt-8 text-white/50 text-[9px] uppercase font-bold tracking-[0.2em] animate-pulse">
                Attendere, non chiudere...
              </p>
            )}
          </div>
        </div>
      )}

      {showMassEmailModal && (
        <div className="fixed inset-0 z-[2000] flex items-start pt-28 justify-center p-4 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => {
              setShowMassEmailModal(false);
              setShowLogModal(true); // Riapre il menu Admin
            }}
          ></div>

          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-lg rounded-[3rem] p-8 shadow-2xl overflow-hidden overflow-y-auto max-h-[80vh]">
            {/* INTESTAZIONE E FILTRI */}
            <div className="text-center mb-6">
              <h2 className="text-white font-black text-xl uppercase tracking-tighter">
                Nuova Comunicazione
              </h2>
              <p className="text-blue-400 text-[10px] font-bold uppercase mt-1">
                {singleEmailTarget
                  ? `Destinatario: ${singleEmailTarget.nome} ${singleEmailTarget.cognome}`
                  : `Target: ${membriTarget.length} Membri Selezionati`}
              </p>
            </div>
            {/* FILTRI (Cachés si on est en mode "Single Email") */}
            {!singleEmailTarget && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">
                    Filtra per Stato
                  </label>
                  <div className="flex flex-nowrap w-full gap-1.5">
                    {["ATTIVO", "INATTIVO", "SOSPESO", "ESCLUSO"].map((s) => (
                      <button
                        key={s}
                        onClick={() =>
                          setFilters({
                            ...filters,
                            stati: filters.stati.includes(s)
                              ? filters.stati.filter((i) => i !== s)
                              : [...filters.stati, s],
                          })
                        }
                        className={`flex-1 px-1 py-1.5 rounded-xl text-[8px] font-black transition-all border truncate ${
                          filters.stati.includes(s)
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-white/5 border-white/10 text-slate-400"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase ml-2 mb-1 block">
                    Filtra per Ruolo
                  </label>
                  <div className="flex flex-nowrap w-full gap-1.5">
                    {["PASSIVO", "VOLONTARIO", "STAFF", "ADMIN"].map((r) => (
                      <button
                        key={r}
                        onClick={() =>
                          setFilters({
                            ...filters,
                            ruoli: filters.ruoli.includes(r)
                              ? filters.ruoli.filter((i) => i !== r)
                              : [...filters.ruoli, r],
                          })
                        }
                        className={`flex-1 px-1 py-1.5 rounded-xl text-[8px] font-black transition-all border truncate ${
                          filters.ruoli.includes(r)
                            ? "bg-emerald-600 border-emerald-500 text-white"
                            : "bg-white/5 border-white/10 text-slate-400"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. DA QUI IN POI CONTINUA IL RESTO DEL TUO FORM (Subject, Message, File) */}
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-blue-400 uppercase ml-2 mb-2 block">
                  Oggetto della Email
                </label>
                <input
                  type="text"
                  placeholder="Inserisci l'oggetto..."
                  className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500 transition-all font-bold"
                  value={emailForm.subject}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, subject: e.target.value })
                  }
                />
              </div>

              {/* ... e così via fino alla fine del modale */}

              {/* Campo Messaggio */}
              <div>
                <label className="text-[10px] font-black text-blue-400 uppercase ml-2 mb-2 block">
                  Messaggio
                </label>
                <textarea
                  rows="5"
                  placeholder="Ti scriviamo per..."
                  className="w-full bg-slate-900/50 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-blue-500 transition-all text-sm leading-relaxed"
                  value={emailForm.message}
                  onChange={(e) =>
                    setEmailForm({ ...emailForm, message: e.target.value })
                  }
                ></textarea>
              </div>

              {/* AREA UPLOAD MULTI-FILE */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-400 uppercase ml-2 block">
                  Allega Documenti
                </label>

                <div className="relative">
                  {/* L'input est maintenant 'multiple' et utilise handleFileChange */}
                  <input
                    type="file"
                    id="fileUpload"
                    className="hidden"
                    multiple
                    onChange={handleFileChange}
                  />

                  {/* Bouton pour ajouter */}
                  <label
                    htmlFor="fileUpload"
                    className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer border-white/10 bg-white/5 hover:border-blue-500/50"
                  >
                    <svg
                      className="w-5 h-5 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span className="text-[10px] font-black uppercase text-slate-400">
                      Aggiungi File
                    </span>
                  </label>

                  {/* LISTE DES FICHIERS SÉLECTIONNÉS */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-32 overflow-y-auto pr-1">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-white/5 group"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <svg
                              className="w-5 h-5 text-emerald-400 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <div className="flex flex-col text-left truncate">
                              <span className="text-[10px] font-black uppercase truncate text-emerald-400">
                                {file.name}
                              </span>
                              <span className="text-[8px] text-slate-500 uppercase tracking-widest">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                            </div>
                          </div>

                          {/* Bouton Supprimer */}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              removeFile(index);
                            }}
                            className="w-6 h-6 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center font-bold shrink-0 hover:bg-red-500 hover:text-white transition-colors"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pulsanti Azione */}
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowMassEmailModal(false);
                    if (!singleEmailTarget) setShowLogModal(true);
                    setSingleEmailTarget(null);
                  }}
                  className="bg-white/5 py-4 rounded-2xl font-black text-slate-500 uppercase text-[10px] tracking-widest border border-white/5"
                >
                  Annulla
                </button>
                <button
                  onClick={handleStartMassSending}
                  className="bg-blue-600 py-4 rounded-2xl font-black text-white uppercase text-[10px] tracking-widest shadow-lg shadow-blue-900/40 active:scale-95 transition-all"
                >
                  Invia
                </button>
              </div>
            </div>
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
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setModalAlert(null)}
          ></div>
          <div className="relative glass bg-slate-900 border border-red-500/50 w-full max-w-sm rounded-[3rem] p-8 text-center shadow-2xl shadow-red-900/20">
            {" "}
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
      {/* MODALE DI CONFERMA DESIGNER */}
      {confirmAction && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setConfirmAction(null)}
          ></div>

          <div className="relative glass bg-[#1e293b] border border-white/10 w-full max-w-xs rounded-[3rem] p-8 text-center shadow-2xl overflow-hidden">
            {/* Glow d'accento dietro l'icona */}
            <div
              className={`absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 blur-3xl opacity-20 bg-${confirmAction.color}-500`}
            ></div>

            <div className="text-5xl mb-4 relative">{confirmAction.icon}</div>

            <h3 className="text-white font-black text-xl uppercase tracking-tighter mb-2">
              {confirmAction.title}
            </h3>

            <p className="text-slate-400 text-xs leading-relaxed mb-8">
              {confirmAction.message}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={confirmAction.onConfirm}
                className={`w-full py-4 rounded-2xl font-black text-white uppercase text-[10px] tracking-[0.2em] shadow-lg active:scale-95 transition-all ${
                  confirmAction.color === "blue"
                    ? "bg-blue-600 shadow-blue-900/40"
                    : "bg-purple-600 shadow-purple-900/40"
                }`}
              >
                Conferma Operazione
              </button>

              <button
                onClick={() => setConfirmAction(null)}
                className="w-full bg-white/5 py-4 rounded-2xl font-black text-slate-500 uppercase text-[10px] tracking-widest border border-white/5 active:scale-95 transition-all"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
