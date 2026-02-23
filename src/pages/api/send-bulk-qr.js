import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Metodo non consentito" });

  // Configurazione del trasportatore Gmail
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    // 1. Recuperare i membri che non hanno ancora ricevuto l'email
    const { data: membres, error } = await supabase
      .from("membres")
      .select("id, nome, cognome, email, codice_qr")
      .eq("mail_sent", false)
      .not("email", "is", null);

    if (error) throw error;
    if (membres.length === 0)
      return res
        .status(200)
        .json({
          message: "Tutti i membri hanno già ricevuto il loro QR Code!",
        });

    let sentCount = 0;

    // 2. Ciclo di invio
    for (const m of membres) {
      await transporter.sendMail({
        from: `"STAFF UNISP" <${process.env.EMAIL_USER}>`,
        to: m.email,
        subject: `Il tuo QR Code UNISP - ${m.nome}`,
        html: `
          <div style="font-family: sans-serif; text-align: center; background-color: #f8fafc; padding: 40px;">
            <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 30px; padding: 30px; border: 1px solid #e2e8f0;">
              <h2 style="color: #1e293b; margin-bottom: 5px; text-transform: uppercase;">Ciao ${m.nome},</h2>
              <p style="color: #64748b; font-size: 14px;">Ecco il tuo pass d'accesso personale per l'UNISP.</p>
              
              <div style="margin: 30px 0;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${m.codice_qr}" 
                     alt="Il tuo QR Code"
                     style="border: 8px solid #f1f5f9; border-radius: 20px;" />
              </div>
              
              <p style="font-size: 24px; font-weight: 900; color: #2563eb; letter-spacing: 4px; font-family: monospace;">${m.codice_qr}</p>
              
              <p style="font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 20px;">Mostra questo codice all'ingresso</p>
            </div>
            <p style="font-size: 10px; color: #cbd5e1; margin-top: 20px;">Email generata automaticamente dal sistema UNISP SYSTEM</p>
          </div>
        `,
      });

      // 3. Segna come inviato nel database Supabase
      await supabase.from("membres").update({ mail_sent: true }).eq("id", m.id);
      sentCount++;
    }

    res.status(200).json({ success: true, count: sentCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
