import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { rows } = req.body;
  let importedCount = 0;
  let skippedCount = 0;

  try {
    // 1. PULIZIA E DEDUPLICAZIONE LOCALE (nel file)
    const cleanData = rows.map(row => {
      // Estrae (VOLONTARIO) o (PASSIVO)
      const tipoMatch = row.tipo?.match(/\((.*?)\)/);
      const tipoClean = tipoMatch ? tipoMatch[1] : row.tipo;
      
      // Converte la stringa crono in oggetto Date per il confronto
      // Gestisce il formato 21/02/2026 19.34.34 -> 19:34:34
      const cronoFormatted = row.crono?.replace(/\./g, ':');

      return {
        ...row,
        cronoDate: new Date(cronoFormatted),
        telefono_clean: row.tel?.replace('+39', '').replace(/\s/g, '').trim(),
        tipologia_socio_clean: tipoClean?.toUpperCase(),
      };
    });

    // Rimuove duplicati nel file: tiene solo la riga con crono più recente per ogni Codice Fiscale
    const uniqueInFile = Object.values(
      cleanData.reduce((acc, current) => {
        const cf = current.cf?.trim().toUpperCase();
        if (!cf) return acc;
        if (!acc[cf] || current.cronoDate > acc[cf].cronoDate) {
          acc[cf] = current;
        }
        return acc;
      }, {})
    );

    // 2. INSERIMENTO NEL DATABASE
    for (const member of uniqueInFile) {
      const cfClean = member.cf.trim().toUpperCase();

      // Controllo se esiste già nel DB (per Codice Fiscale)
      const { data: existing } = await supabase
        .from('membres')
        .select('id')
        .eq('codice_fiscale', cfClean)
        .maybeSingle();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Generazione credenziali automatiche
      const qrCode = uuidv4().slice(0, 8).toUpperCase();
      let password = null;
      if (member.tipologia_socio_clean === 'VOLONTARIO') {
        password = Math.random().toString(36).slice(-7); // 7 caratteri
      }

      // Mappatura colonne Database <-> Colonne CSV
      const { error } = await supabase.from('membres').insert([{
        info_cronologiche: member.crono,
        email: member.email?.trim().toLowerCase(),
        nome: member.nome?.trim(),
        cognome: member.cognome?.trim(),
        telefono: member.telefono_clean,
        codice_fiscale: cfClean,
        tipologia_socio: member.tipologia_socio_clean,
        is_studente: member.studente,
        matricola: member.matre,
        certificato_iscrizione_url: member.cert,
        nome_corso: member.corso,
        anno_corso: member.anno,
        permesso_soggiorno_url: member.permesso,
        documento_id_url: member.doc,
        isee_url: member.isee,
        consenso_privacy: member.privacy,
        stato: 'Attivo',
        codice_qr: qrCode,
        password: password
      }]);

      if (error) {
        console.error(`Errore inserimento CF ${cfClean}:`, error.message);
      } else {
        importedCount++;
      }
    }

    return res.status(200).json({ success: true, imported: importedCount, skipped: skippedCount });

  } catch (err) {
    console.error("Errore Generale API:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}