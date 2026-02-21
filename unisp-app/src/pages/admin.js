import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';

export default function Admin() {
    const [membres, setMembres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    // On initialise le filtre sur VOLONTARIO pour ne pas avoir une page vide au départ
    const [filter, setFilter] = useState('VOLONTARIO');

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('unisp_user'));
        if (!user || user.tipologia_socio?.toUpperCase() !== 'STAFF') {
            window.location.href = '/dashboard';
            return;
        }
        fetchMembres();
    }, []);

    const fetchMembres = async () => {
        setLoading(true);
        const { data } = await supabase.from('membres').select('*').order('nome', { ascending: true });
        if (data) setMembres(data);
        setLoading(false);
    };

    const authorizeVolontaire = async (id) => {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
        const { error } = await supabase.from('membres').update({
            auth_scan_active: true,
            auth_scan_expires_at: expiresAt.toISOString()
        }).eq('id', id);

        if (!error) fetchMembres();
    };

    const revokeVolontaire = async (id) => {
        const { error } = await supabase.from('membres').update({
            auth_scan_active: false,
            auth_scan_expires_at: null
        }).eq('id', id);

        if (!error) fetchMembres();
    };

    // LOGIQUE DE FILTRAGE MISE À JOUR
    const filteredMembres = membres.filter(m => {
        const fullSearch = `${m.nome} ${m.cognome}`.toLowerCase().includes(searchTerm.toLowerCase());
        const now = new Date();
        const isAuthValid = m.auth_scan_active && new Date(m.auth_scan_expires_at) > now;

        if (filter === 'AUTH_OK') return fullSearch && isAuthValid;
        // Pour les autres filtres (VOLONTARIO, STAFF, PASSIVO)
        return fullSearch && m.tipologia_socio?.toUpperCase() === filter;
    });

    return (
        <Layout>
            <div className="space-y-6">
                <h1 className="text-white font-black text-2xl uppercase tracking-tighter">Administration</h1>

                {/* RECHERCHE */}
                <input
                    type="text"
                    placeholder="Chercher un nom ou prénom..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                {/* FILTRES ÉPURÉS : UNIQUEMENT LES 3 DEMANDÉS */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {[
                        { id: 'VOLONTARIO', label: 'Volontaires' },
                        { id: 'AUTH_OK', label: 'Accès Actif' },
                        { id: 'STAFF', label: 'Staff' }
                    ].map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${filter === f.id
                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/40'
                                : 'bg-white/5 border-white/10 text-slate-400'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* LISTE DES MEMBRES */}
                <div className="space-y-3">
                    {loading ? (
                        <p className="text-center text-slate-600 py-10 font-bold uppercase tracking-widest animate-pulse text-xs">Chargement de la base...</p>
                    ) : filteredMembres.length === 0 ? (
                        <p className="text-center text-slate-600 py-10 italic">Aucun membre trouvé pour ce filtre</p>
                    ) : (
                        filteredMembres.map((m) => {
                            // Normalisation du statut pour éviter les erreurs de majuscules
                            const s = m.stato ? m.stato.toUpperCase().trim() : "INATTIVO";

                            // Logique de design originale (Badge + Point)
                            let badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20"; // Défaut: ESCLUSO ou Erreur
                            let dotStyle = "bg-red-500";

                            if (s === 'ATTIVO') {
                                badgeStyle = "bg-green-500/10 text-green-400 border-green-500/20";
                                dotStyle = "bg-green-500";
                            } else if (s === 'SOSPESO') {
                                badgeStyle = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
                                dotStyle = "bg-yellow-500";
                            } else if (s === 'INATTIVO') {
                                badgeStyle = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                                dotStyle = "bg-blue-500";
                            } else if (s === 'ESCLUSO') {
                                badgeStyle = "bg-red-600/20 text-red-500 border-red-600/30";
                                dotStyle = "bg-red-600";
                            }

                            const isAuth = m.auth_scan_active && new Date(m.auth_scan_expires_at) > new Date();

                            return (
                                <div key={m.id} className="glass p-5 rounded-[2rem] border border-white/5 shadow-xl transition-all">
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <p className="text-white font-black uppercase tracking-tight text-sm">
                                                <span className="font-light">{m.nome}</span> <span className="text-blue-500 ml-1">{m.cognome}</span>
                                            </p>
                                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">{m.tipologia_socio}</p>
                                        </div>

                                        {/* BADGE PREMIUM AVEC POINT CLIGNOTANT */}
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${badgeStyle} backdrop-blur-md shadow-sm`}>
                                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotStyle}`}></span>
                                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                                {s}
                                            </span>
                                        </div>
                                    </div>

                                    {m.tipologia_socio === 'VOLONTARIO' && (
                                        <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-2">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Scanner App</span>
                                                <span className={`text-[10px] font-black ${isAuth ? 'text-green-400' : 'text-red-500'}`}>
                                                    {isAuth ? '● ACCÈS ACTIF' : '○ ACCÈS RÉVOQUÉ'}
                                                </span>
                                            </div>

                                            {isAuth ? (
                                                <button onClick={() => revokeVolontaire(m.id)}
                                                    className="bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all">
                                                    Retirer l'accès
                                                </button>
                                            ) : (
                                                <button onClick={() => authorizeVolontaire(m.id)}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-blue-600/30">
                                                    Donner 48H
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </Layout>
    );
}