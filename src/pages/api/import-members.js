import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const crypto = require("crypto");
function generateDeterministicQR(cf) {
  // 1. Créer le hash SHA-256 complet
  const fullHash = crypto.createHash("sha256").update(cf).digest("hex");

  // 2. Trouver la première séquence de 10 caractères qui ne commence pas par '0'
  // On parcourt le hash par paliers pour trouver une section "propre"
  let startIndex = 0;
  while (fullHash[startIndex] === "0" && startIndex < fullHash.length - 10) {
    startIndex++;
  }

  // 3. Extraire les 10 caractères à partir de cet index
  const subHash = fullHash.substring(startIndex, startIndex + 10);
  const decimalValue = parseInt(subHash, 16);

  // 4. Convertir en Base36 (0-9, A-Z)
  let code = decimalValue.toString(36).toUpperCase();

  // 5. Ajustement de la longueur à 6 caractères
  // Si le code résultant commence encore par 0 (rare après le décalage),
  // on utilise un décalage de sécurité alphabétique
  if (code.startsWith("0")) {
    const alphabet = "ABCDEFGHIJKLMNPQRSTUVWXYZ"; // On exclut O pour éviter confusion avec 0
    let replacement = alphabet[cf.length % alphabet.length];
    code = replacement + code.substring(1);
  }

  // On s'assure d'avoir exactement 6 caractères
  return code.padEnd(6, "X").substring(0, 6);
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Method not allowed" });

  const { rows } = req.body;
  let importedCount = 0;
  let skippedCount = 0;

  try {
    // 1. PULIZIA E DEDUPLICAZIONE LOCALE
    const cleanData = rows.map((row) => {
      const tipoMatch = row.tipo?.match(/\((.*?)\)/);
      const tipoClean = tipoMatch ? tipoMatch[1] : row.tipo;

      // --- CORREZIONE DATE (Format: 21/02/2026 19.34.34) ---
      // On sépare la date et l'heure
      const parts = row.crono?.split(" ");
      let finalDate = new Date(0); // Date par défaut (très ancienne)

      if (parts && parts.length >= 1) {
        const dateParts = parts[0].split("/"); // [21, 02, 2026]
        const timeParts = parts[1]?.replace(/\./g, ":"); // 19:34:34

        if (dateParts.length === 3) {
          // On reconstruit au format ISO : YYYY-MM-DDTHH:mm:ss
          const isoString = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timeParts || "00:00:00"}`;
          finalDate = new Date(isoString);
        }
      }

      return {
        ...row,
        cronoDate: finalDate, // Maintenant JavaScript peut comparer !
        telefono_clean: row.tel?.replace("+39", "").replace(/\s/g, "").trim(),
        tipologia_socio_clean: tipoClean?.toUpperCase(),
      };
    });

    // Rimuove duplicati nel file: TIENE LA PIÙ RECENTE
    const uniqueInFile = Object.values(
      cleanData.reduce((acc, current) => {
        const cf = current.cf?.trim().toUpperCase();
        if (!cf) return acc;

        // La comparaison (>) fonctionne maintenant car cronoDate est un vrai objet Date
        if (!acc[cf] || current.cronoDate > acc[cf].cronoDate) {
          acc[cf] = current;
        }
        return acc;
      }, {}),
    );

    // 2. INSERIMENTO NEL DATABASE
    for (const member of uniqueInFile) {
      const cfClean = member.cf.trim().toUpperCase();

      // Controllo se esiste già nel DB (per Codice Fiscale)
      const { data: existing } = await supabase
        .from("membres")
        .select("id")
        .eq("codice_fiscale", cfClean)
        .maybeSingle();

      if (existing) {
        skippedCount++;
        continue;
      }

      // Generazione credenziali automatiche
      const qrCode = generateDeterministicQR(cfClean);

      let password = null;
      if (member.tipologia_socio_clean === "VOLONTARIO") {
        password = "pasta";
      }

      // Mappatura colonne Database <-> Colonne CSV
      const { error } = await supabase.from("membres").insert([
        {
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
          stato: "SOSPESO",
          codice_qr: qrCode,
          password: password,
        },
      ]);

      if (error) {
        console.error(`Errore inserimento CF ${cfClean}:`, error.message);
      } else {
        importedCount++;
      }
    }

    return res
      .status(200)
      .json({ success: true, imported: importedCount, skipped: skippedCount });
  } catch (err) {
    console.error("Errore Generale API:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
