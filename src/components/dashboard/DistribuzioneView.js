import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase"; // <-- IMPORT MAGIQUE DU CLOUD

export default function DistribuzioneView({
  prenotazioni,
  user,
  membres,
  createLog,
}) {
  const [alimentiLocali, setAlimentiLocali] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(true); // Pour le petit effet de chargement au début
  const [errorAlert, setErrorAlert] = useState(null);
  const [numeroDeleghe, setNumeroDeleghe] = useState(0);

  // --- NOUVEAU BLOC SÉCURITÉ ---
  const isAuthorized =
    user?.tipologia_socio?.toUpperCase() === "ADMIN" ||
    user?.tipologia_socio?.toUpperCase() === "STAFF";

  const handleUnauthorizedClick = () => {
    setErrorAlert({
      title: "Accesso Negato",
      message:
        "Non sei autorizzato a caricare o modificare l'inventario. Contatta lo staff per assistenza.",
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
  };
  // -----------------------------
  // 1. 100% CLOUD : On va chercher les aliments d'AUJOURD'HUI dans la base de données
  const fetchAlimentiOggi = async () => {
    try {
      setIsLoadingCloud(true);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("alimenti")
        .select("*") // Récupère toutes les colonnes, y compris 'deleghe'
        .gte("created_at", startOfDay.toISOString());

      if (!error && data && data.length > 0) {
        setAlimentiLocali(data);
        // Si la colonne 'deleghe' existe dans ta table, on met à jour l'état local
        if (data[0].deleghe !== undefined) {
          setNumeroDeleghe(data[0].deleghe || 0);
        }
      } else {
        setAlimentiLocali([]);
      }
    } catch (err) {
      console.error("Errore fetch:", err);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const updateDelegheCloud = async (val) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Met à jour la valeur dans la base de données pour aujourd'hui
    const { error } = await supabase
      .from("alimenti")
      .update({ deleghe: val })
      .gte("created_at", startOfDay.toISOString());

    if (error) {
      console.error("Erreur de sauvegarde des deleghe:", error);
    } else if (createLog) {
      await createLog("UPDATE_DELEGHE", `Numero deleghe aggiornato a: ${val}`);
    }
  };

  // Au chargement de l'onglet, on vérifie le cloud
  useEffect(() => {
    fetchAlimentiOggi();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // SÉCURITÉ ANTI-EXCEL : On bloque tout ce qui n'est pas un fichier .csv
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorAlert({
        title: "Formato non valido",
        message: "Per favore, carica esclusivamente file in formato .CSV",
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
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        ),
      });
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const lines = event.target.result.split("\n");
      const dateRaw =
        lines[1]?.split(",")[0] || new Date().toLocaleDateString("it-IT");

      Papa.parse(lines.slice(2).join("\n"), {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const processed = results.data
            .filter((row) => {
              const prodotto = (row["ALIMENTI"] || "").trim().toUpperCase();
              const quantitaRaw = (row["QUANTITA'"] || "").trim();
              return (
                prodotto !== "" &&
                prodotto !== "EMPTY" &&
                quantitaRaw !== "" &&
                quantitaRaw !== "0"
              );
            })
            .map((item) => {
              const raw = (item["QUANTITA'"] || "").trim();
              const match = raw.match(/(KG|N|PZ)\.?\s*([\d,.]+)/i);

              return {
                prodotto: item["ALIMENTI"].trim(),
                quantita: match ? parseFloat(match[2].replace(",", ".")) : 0,
                unita_metrica: match
                  ? match[1].toUpperCase() // On prend juste les lettres (KG, N, PZ)
                  : "PZ",
              };
            });

          try {
            // On envoie le fichier au serveur (Supabase)
            const res = await fetch("/api/import-alimenti", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ data: processed, dateFile: dateRaw }),
            });

            if (res.ok) {
              if (createLog) {
                await createLog(
                  "IMPORT_ALIMENTI",
                  `Importato file inventario: ${file.name}`,
                );
              }
              // Si réussi, on recharge la liste depuis le CLOUD (pour que tout le monde soit synchro)
              await fetchAlimentiOggi();
            }
          } catch (err) {
            console.error("Erreur API de sauvegarde:", err);
          } finally {
            setIsUploading(false);
            e.target.value = "";
          }
        },
      });
    };
    reader.readAsText(file);
  };

  // 100% CLOUD : Ce bouton supprime DANS LA BASE DE DONNÉES !
  const handleEliminaCloud = async () => {
    try {
      setIsLoadingCloud(true);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // On efface les enregistrements de Supabase créés aujourd'hui
      await supabase
        .from("alimenti")
        .delete()
        .gte("created_at", startOfDay.toISOString());

      if (createLog) {
        await createLog(
          "DELETE_ALIMENTI",
          `Cancellato l'inventario alimenti odierno`,
        );
      }
      // On vide l'écran
      setAlimentiLocali([]);
    } catch (error) {
      console.error("Errore eliminazione cloud:", error);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  // 1. CALCUL DU STAFF (Vérifie bien que tu n'as que 2 personnes Admin/Staff dans ta liste)
  const staffTotal = (membres || []).filter((m) =>
    ["ADMIN", "STAFF"].includes(m.tipologia_socio?.toUpperCase()),
  ).length;

  const poidsStaff = staffTotal * 3;

  // 2. CONVERSION FORCÉE EN NOMBRE (Très important !)
  const totalScans = Number(prenotazioni?.length) || 0;
  const totalDeleghe = Number(numeroDeleghe) || 0;

  // 3. CALCUL DU DIVISEUR UNIQUE
  // Dans ton cas : 0 + 42 + 6 = 48
  const diviseurTotal = totalScans + totalDeleghe + poidsStaff;

  // Sécurité anti-division par zéro
  const finalDivisor = diviseurTotal > 0 ? diviseurTotal : 1;

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-500 relative">
      {/* MODAL D'ERREUR CUSTOM */}
      {errorAlert && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            onClick={() => setErrorAlert(null)}
          ></div>
          <div className="relative glass bg-slate-900 border border-red-500/50 w-full max-w-sm rounded-[3rem] p-8 text-center shadow-2xl shadow-red-900/20">
            {errorAlert.icon}
            <h2 className="text-white font-black text-xl mb-3 tracking-tighter uppercase">
              {errorAlert.title}
            </h2>
            <p className="text-slate-400 text-xs mb-8">{errorAlert.message}</p>
            <button
              onClick={() => setErrorAlert(null)}
              className="w-full bg-red-600/20 border border-red-500/50 py-4 rounded-2xl font-black text-red-400 uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all active:scale-95"
            >
              Ho capito
            </button>
          </div>
        </div>
      )}

      {/* GESTION DE L'AFFICHAGE SELON LE CLOUD */}
      {isLoadingCloud ? (
        // ECRAN DE CHARGEMENT CLOUD
        <div className="glass p-12 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center text-center">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest animate-pulse">
            Sincronizzazione Cloud...
          </p>
        </div>
      ) : alimentiLocali.length === 0 ? (
        // ECRAN UPLOAD (Si rien dans le Cloud aujourd'hui)
        <div className="glass p-8 rounded-[3rem] border border-white/10 shadow-2xl flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4 border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <svg
              className="w-8 h-8 text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M12 3v17.25m0 0c1.4-1.4 4-2.25 6.5-2.25s5.1.85 6.5 2.25M12 20.25c-1.4-1.4-4-2.25-6.5-2.25s-5.1.85-6.5 2.25M12 3L3.75 8.25m8.25-5.25l8.25 5.25M3.75 8.25A2.25 2.25 0 0 0 6 10.5h-4.5a2.25 2.25 0 0 0 2.25-2.25v.008ZM20.25 8.25A2.25 2.25 0 0 0 18 10.5h4.5a2.25 2.25 0 0 0-2.25-2.25v.008Z"
              />
            </svg>
          </div>
          <h2 className="text-white font-black text-xl uppercase tracking-tighter mb-2">
            Import Alimenti
          </h2>
          <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-6">
            Persone attuali:{" "}
            <span className="text-emerald-400 text-sm">
              {prenotazioni.length}
            </span>
          </p>

          {/* SÉCURITÉ : Bouton dynamique selon le rôle */}
          {isAuthorized ? (
            <label
              className={`w-full max-w-xs cursor-pointer ${isUploading ? "bg-slate-800" : "bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30"} text-white py-4 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all inline-block active:scale-95`}
            >
              {isUploading ? "Elaborazione in corso..." : "Carica il file CSV"}
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          ) : (
            <button
              onClick={handleUnauthorizedClick}
              className="w-full max-w-xs cursor-pointer bg-slate-800/50 text-slate-400 border border-white/10 py-4 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all inline-block hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
            >
              Carica
            </button>
          )}
        </div>
      ) : (
        // ECRAN TABLEAU (Il y a des données dans le Cloud)
        <>
          {/* NUOVA AREA DISCRETA (Solo Staff/Admin) */}
          {isAuthorized && (
            <div className="flex justify-end items-center gap-3 px-2 mb-4">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                Deleghe:
              </span>
              <input
                type="number"
                min="0"
                value={numeroDeleghe}
                onChange={(e) =>
                  setNumeroDeleghe(Math.max(0, parseInt(e.target.value) || 0))
                }
                onBlur={(e) =>
                  updateDelegheCloud(Math.max(0, parseInt(e.target.value) || 0))
                }
                className="w-14 h-7 bg-slate-900/50 border border-white/10 rounded-lg text-center text-white text-[10px] font-black outline-none focus:border-blue-500 transition-all"
              />
            </div>
          )}
          <div className="flex justify-between items-end px-2">
            <div>
              <h2 className="text-blue-500 font-black text-sm uppercase tracking-tighter flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Distribuzione Odierna
              </h2>
              <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest block mt-0.5 ml-4">
                {new Date().toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
            </div>

            {isAuthorized && (
              <button
                onClick={handleEliminaCloud}
                className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-red-500/20 transition-colors active:scale-95"
              >
                Elimina
              </button>
            )}
          </div>

          <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl bg-slate-900/50">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th className="p-4 text-[9px] uppercase tracking-widest text-slate-400 font-black">
                      Prodotto
                    </th>
                    <th className="p-4 text-[9px] uppercase tracking-widest text-blue-400 font-black text-right">
                      quantita
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {alimentiLocali.map((item, idx) => {
                    // 1. On récupère la quantité (ex: 42)
                    const qta = Number(item.quantita) || 0;

                    // 2. On divise par le diviseur qui est dans ta console (ex: 48)
                    const divisione = qta / finalDivisor;

                    // 3. Arrondi par défaut (Math.floor(0.875) = 0)
                    let risultato = Math.floor(divisione);

                    // 4. Ta règle : si c'est 0, on met 1
                    if (risultato < 1) risultato = 1;

                    return (
                      <tr
                        key={idx}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="p-3 text-xs text-white font-bold uppercase tracking-tight">
                          {item.prodotto}
                        </td>
                        <td className="p-3 text-base text-emerald-400 font-black text-right">
                          {/* ON AFFICHE LA VARIABLE 'risultato' DIRECTEMENT */}
                          {risultato}{" "}
                          <span className="text-[9px] text-emerald-600 ml-1">
                            {item.unita_metrica}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
