import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Metodo non consentito" });

  console.log("--- INIZIO BATCH INVIO EMAIL ---");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    // 1. Prendiamo solo i primi 5 membri che non hanno ancora ricevuto il QR
    const { data: membres, error } = await supabase
      .from("membres")
      .select("id, nome, cognome, email, codice_qr")
      .eq("mail_sent", false)
      .not("email", "is", null)
      .limit(5); // <-- LIMITIAMO IL BATCH PER EVITARE TIMEOUT

    if (error) throw error;

    if (!membres || membres.length === 0) {
      console.log("✅ Nessuna email rimasta da inviare.");
      return res.status(200).json({ success: true, finished: true, count: 0 });
    }

    console.log(`📦 Processando batch di ${membres.length} email...`);

    let currentBatchCount = 0;

    for (const m of membres) {
      console.log(`[${currentBatchCount + 1}/5] Invio a: ${m.email}...`);

      await transporter.sendMail({
        from: `"STAFF UNISP" <${process.env.EMAIL_USER}>`,
        to: m.email,
        subject: `Il tuo QR Code UNISP - ${m.nome}`,
        html: `<div style="font-family:sans-serif;text-align:center;">
                <h2>Ciao ${m.nome},</h2>
                <p>Ecco il tuo QR Code d'accesso.</p>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${m.codice_qr}" />
                <h1 style="letter-spacing:5px;">${m.codice_qr}</h1>
               </div>`,
      });

      await supabase.from("membres").update({ mail_sent: true }).eq("id", m.id);

      currentBatchCount++;
      console.log(`   ✅ Inviata correttamente.`);

      // Pausa breve tra le email del batch
      await sleep(1500);
    }

    // 2. Rispondiamo alla Dashboard dicendo che c'è ancora lavoro da fare
    console.log(`--- BATCH COMPLETATO (${currentBatchCount} email) ---`);
    res
      .status(200)
      .json({ success: true, finished: false, count: currentBatchCount });
  } catch (error) {
    console.error("❌ ERRORE CRITICO:", error.message);
    res.status(500).json({ error: error.message });
  }
}
