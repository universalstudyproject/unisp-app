import nodemailer from "nodemailer";
import { supabase } from "@/lib/supabase";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { memberId } = req.body;

  try {
    const { data: m, error } = await supabase
      .from("membres")
      .select("*")
      .eq("id", memberId)
      .single();

    if (error || !m) throw new Error("Membro non trovato");

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, 
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    // L'URL dell'immagine del QR
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${m.codice_qr}`;

    await transporter.sendMail({
      from: `"UNISP STAFF" <${process.env.EMAIL_USER}>`,
      to: m.email,
      subject: `Il tuo QR PASS - ${m.nome}`,
      html: `
        <div style="text-align:center; font-family:sans-serif; background-color: #f8fafc; padding: 40px;">
          <div style="background-color: #ffffff; padding: 20px; border-radius: 20px; display: inline-block; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; margin-bottom: 5px;">Ciao ${m.nome}!</h2>
            <p style="color: #64748b; font-size: 14px;">Mostra questo codice all'ingresso.</p>
            
            <div style="margin: 20px 0;">
              <img src="cid:qr_code_image" width="200" height="200" style="display: block; margin: 0 auto;" />
            </div>
            
            <p style="font-size: 24px; font-weight: 900; letter-spacing: 5px; color: #3b82f6; margin: 0;">
              ${m.codice_qr}
            </p>
          </div>
          <p style="color: #94a3b8; font-size: 10px; margin-top: 20px; text-transform: uppercase; letter-spacing: 1px;">
            Associazione Unisp 2026
          </p>
        </div>`,
      // ALLEGATI: Qui scarichiamo l'immagine e le diamo un ID (cid)
      attachments: [
        {
          filename: "qrcode.png",
          path: qrUrl,
          cid: "qr_code_image", // Deve essere IDENTICO al src="cid:..." sopra
        },
      ],
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("ERRORE:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
}