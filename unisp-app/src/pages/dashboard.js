import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';

export default function Dashboard() {
    const router = useRouter();
    const [passaggi, setPassaggi] = useState([]);
    const [membres, setMembres] = useState([]);
    const [activeTab, setActiveTab] = useState('passages');
    const [searchTerm, setSearchTerm] = useState('');
    const [scanning, setScanning] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [selectedMembre, setSelectedMembre] = useState(null);
    const [manualInput, setManualInput] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [modalAlert, setModalAlert] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        fetchPassaggi();
        const storedUser = localStorage.getItem('unisp_user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            if (parsedUser?.tipologia_socio?.toUpperCase() === 'STAFF') {
                fetchMembres();
            }
        }
        const interval = setInterval(fetchPassaggi, 6000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (router.isReady && router.query.autoStart === 'true') {
            const timer = setTimeout(() => { startScanner(); }, 300);
            router.replace('/dashboard', undefined, { shallow: true });
            return () => clearTimeout(timer);
        }
    }, [router.isReady, router.query]);

    const fetchPassaggi = async () => {
        const { data } = await supabase
            .from('passaggi')
            .select(`id, scanned_at, numero_giornaliero, membres!membre_id ( nome, cognome )`)
            .order('scanned_at', { ascending: false }).limit(15);
        if (data) setPassaggi(data);
    };

    const fetchMembres = async () => {
        const { data } = await supabase.from('membres').select('*').order('nome', { ascending: true });
        if (data) setMembres(data);
    };

    // GESTION DE LA CAMÉRA
    useEffect(() => {
        let html5QrCode;
        if (scanning && !manualInput) {
            const timer = setTimeout(() => {
                const element = document.getElementById("reader");
                if (element) {
                    html5QrCode = new Html5Qrcode("reader");
                    html5QrCode.start(
                        { facingMode: "environment" },
                        { fps: 15, qrbox: 280 },
                        async (text) => {
                            await html5QrCode.stop();
                            setScanning(false);
                            handleScanSuccess(text);
                        }
                    ).catch(err => console.error("Erreur caméra:", err));
                }
            }, 150);
        }
        return () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(() => { });
            }
        };
    }, [scanning, manualInput]);

    const startScanner = () => {
        const storedUser = localStorage.getItem('unisp_user');
        if (!storedUser) return;
        const currentUser = JSON.parse(storedUser);

        if (currentUser.tipologia_socio?.toUpperCase() === 'VOLONTARIO') {
            const now = new Date();
            const expiry = currentUser.auth_scan_expires_at ? new Date(currentUser.auth_scan_expires_at) : null;
            if (!currentUser.auth_scan_active || !expiry || now > expiry) {
                setModalAlert({
                    title: "ACCÈS EXPIRÉ",
                    message: "Votre autorisation de scan a expiré. Veuillez contacter un administrateur STAFF.",
                    icon: "🔒"
                });
                return;
            }
        }
        setManualInput(false);
        setScanning(true);
    };

    const handleScanSuccess = async (qrCode) => {
        const { data: membre } = await supabase.from('membres').select('id, nome, cognome, stato').eq('codice_qr', qrCode.trim()).single();
        if (!membre) return showFeedback("INCONNU", "bg-slate-900/90", "Code QR invalide", "🚫");

        const nomComplet = `${membre.nome} ${membre.cognome}`;
        if (membre.stato.toLowerCase() !== 'attivo') {
            let color = "bg-red-600/90";
            if (membre.stato.toLowerCase() === 'sospeso') color = "bg-yellow-600/90";
            if (membre.stato.toLowerCase() === 'inattivo') color = "bg-blue-600/90";
            return showFeedback(nomComplet, color, membre.stato.toUpperCase(), "🔒");
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: checkRecent } = await supabase.from('passaggi').select('numero_giornaliero').eq('membre_id', membre.id).gt('scanned_at', startOfDay.toISOString()).maybeSingle();
        if (checkRecent) return showFeedback(nomComplet, "bg-blue-500/90", `DÉJÀ PASSÉ (N° ${checkRecent.numero_giornaliero})`, "ℹ️");

        await supabase.from('passaggi').insert([{ membre_id: membre.id }]);
        setTimeout(async () => {
            const { data: finalData } = await supabase.from('passaggi').select('numero_giornaliero').eq('membre_id', membre.id).gt('scanned_at', startOfDay.toISOString()).single();
            showFeedback(nomComplet, "bg-green-500/90", `ENTRÉE VALIDÉE N° ${finalData?.numero_giornaliero || '??'}`, "✅");
            fetchPassaggi();
        }, 200);
    };

    const showFeedback = (name, bgColor, message, icon) => {
        let glowColor = "shadow-blue-500/50";
        if (bgColor.includes("green")) glowColor = "shadow-green-500/50";
        if (bgColor.includes("red")) glowColor = "shadow-red-500/50";
        if (bgColor.includes("yellow")) glowColor = "shadow-yellow-500/50";
        setFeedback({ name, bgColor, message, icon, glowColor });
        setTimeout(() => setFeedback(null), 4000);
    };

    const filteredMembres = membres.filter(m => `${m.nome} ${m.cognome}`.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <Layout>
            <div className="space-y-6">
                {user?.tipologia_socio?.toUpperCase() === 'STAFF' ? (
                    <nav className="flex justify-around mb-6 border-b border-slate-800">
                        <button onClick={() => setActiveTab('passages')} className={`pb-3 px-6 font-black uppercase text-[10px] tracking-widest ${activeTab === 'passages' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500'}`}>Passages</button>
                        <button onClick={() => setActiveTab('membres')} className={`pb-3 px-6 font-black uppercase text-[10px] tracking-widest ${activeTab === 'membres' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500'}`}>Membres</button>
                    </nav>
                ) : (
                    <h2 className="text-white font-black uppercase text-[10px] tracking-[0.2em] mb-4 opacity-50">Derniers passages</h2>
                )}

                {activeTab === 'passages' || user?.tipologia_socio?.toUpperCase() === 'VOLONTARIO' ? (
                    <div className="space-y-3">
                        {passaggi.length === 0 ? <p className="text-center text-slate-600 py-10 italic">Aucun passage enregistré</p> :
                            passaggi.map((p) => (
                                <div key={p.id} className="glass p-4 rounded-2xl flex justify-between items-center border-l-4 border-blue-500 mb-3 shadow-lg">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-white text-sm">{p.membres?.nome} {p.membres?.cognome}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{new Date(p.scanned_at).toLocaleTimeString('fr-FR')}</span>
                                    </div>
                                    <span className="bg-blue-600 text-white text-[11px] px-3 py-1 rounded-lg font-black italic">N° {p.numero_giornaliero}</span>
                                </div>
                            ))
                        }
                    </div>
                ) : (
                    /* VUE MEMBRES CORRIGÉE AVEC DESIGN PREMIUM */
                    <div className="space-y-4">
                        <input type="text" placeholder="Recherche..." className="w-full bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 text-white outline-none" onChange={(e) => setSearchTerm(e.target.value)} />

                        <div className="space-y-3">
                            {filteredMembres.map((m) => {
                                // Logique de statut identique à Administration
                                const s = m.stato ? String(m.stato).toUpperCase().trim() : "INATTIVO";
                                let badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
                                let dotStyle = "bg-red-500";

                                if (s.includes('INATTIVO')) {
                                    badgeStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                                    dotStyle = "bg-blue-500";
                                } else if (s.includes('ATTIVO')) {
                                    badgeStyle = "bg-green-500/10 text-green-400 border-green-500/20";
                                    dotStyle = "bg-green-500";
                                } else if (s.includes('SOSPESO')) {
                                    badgeStyle = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                                    dotStyle = "bg-yellow-500";
                                } else if (s.includes('ESCLUSO')) {
                                    badgeStyle = "bg-red-600/20 text-red-500 border-red-600/30";
                                    dotStyle = "bg-red-600";
                                }

                                return (
                                    <div key={m.id} onClick={() => setSelectedMembre(m)} className="glass p-4 rounded-2xl flex justify-between items-center border border-white/5 cursor-pointer active:scale-95 transition-all">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-white text-sm">{m.nome} {m.cognome}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">QR: {m.codice_qr}</span>
                                        </div>

                                        {/* Badge avec point clignotant réintégré ici */}
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${badgeStyle} backdrop-blur-md`}>
                                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotStyle}`}></span>
                                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                                {s}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* OVERLAYS (Scanning, Feedback, Alerte) RESTE INCHANGÉ */}
            {scanning && (
                <div className="fixed inset-0 bg-[#0f172a] z-[200] flex flex-col items-center">
                    <div className="p-6 w-full flex justify-between items-center bg-slate-900/80 text-white">
                        <span className="font-black text-blue-500 text-[10px] tracking-[0.2em] uppercase">
                            {manualInput ? "Saisie Manuelle" : "Scanner Actif"}
                        </span>
                        <button onClick={() => { setScanning(false); setManualInput(false); }} className="bg-white/10 w-10 h-10 rounded-full text-2xl flex items-center justify-center">&times;</button>
                    </div>

                    <div className="w-full grow flex flex-col items-center justify-center p-6">
                        {!manualInput ? (
                            <div className="w-full flex flex-col items-center">
                                <div id="reader" className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10"></div>
                                <button onClick={() => setManualInput(true)} className="mt-10 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl text-blue-400 text-[10px] font-black uppercase tracking-widest">Saisir le code à la main</button>
                            </div>
                        ) : (
                            <div className="glass w-full max-w-sm p-10 rounded-[3rem] border border-white/10 shadow-2xl text-center space-y-6">
                                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Entrez le code QR</p>
                                <input type="text" autoFocus value={manualCode} onChange={(e) => setManualCode(e.target.value.toUpperCase())} placeholder="EX: ABC123" className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-4 py-5 text-white text-center font-black tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500" />
                                <div className="flex flex-col gap-3 pt-4">
                                    <button onClick={() => { handleScanSuccess(manualCode); setManualCode(''); setManualInput(false); }} className="w-full bg-blue-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest">Valider</button>
                                    <button onClick={() => setManualInput(false)} className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2">Retour Caméra</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!scanning && (
                <button onClick={startScanner} className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] z-50 active:scale-90 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                </button>
            )}

            {feedback && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 animate-in fade-in duration-500">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"></div>
                    <div className={`relative ${feedback.bgColor} ${feedback.glowColor} w-full max-w-sm rounded-[3.5rem] p-10 shadow-[0_0_50px_-12px] border border-white/30 text-center transform animate-in zoom-in-90 duration-300`}>
                        <div className="text-7xl mb-6">{feedback.icon}</div>
                        <h3 className="text-white text-xs font-black uppercase tracking-[0.3em] mb-4 opacity-90">{feedback.name}</h3>
                        <p className="text-white text-4xl font-black uppercase leading-none tracking-tighter mb-2">{feedback.message}</p>
                        <button onClick={() => setFeedback(null)} className="mt-12 bg-white text-slate-900 px-10 py-4 rounded-full text-[11px] font-black uppercase tracking-[0.2em]">Continuer</button>
                    </div>
                </div>
            )}

            {modalAlert && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setModalAlert(null)}></div>
                    <div className="relative glass bg-slate-900 border border-white/10 w-full max-w-sm rounded-[3rem] p-8 text-center shadow-[0_0_50px_-10px_rgba(59,130,246,0.3)]">
                        <div className="text-6xl mb-4">{modalAlert.icon}</div>
                        <h2 className="text-white font-black text-xl mb-3 tracking-tighter">{modalAlert.title}</h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">{modalAlert.message}</p>
                        <button onClick={() => setModalAlert(null)} className="w-full bg-blue-600 py-4 rounded-2xl font-black text-white uppercase tracking-widest shadow-lg shadow-blue-600/30">J'ai compris</button>
                    </div>
                </div>
            )}
        </Layout>
    );
}