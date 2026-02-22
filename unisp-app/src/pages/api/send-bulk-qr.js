import nodemailer from 'nodemailer';
import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  // Configuration du transporteur Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    // 1. Récupérer les membres qui n'ont pas encore reçu le mail
    const { data: membres, error } = await supabase
      .from('membres')
      .select('id, nome, cognome, email, codice_qr')
      .eq('mail_sent', false)
      .not('email', 'is', null);

    if (error) throw error;
    if (membres.length === 0) return res.status(200).json({ message: "Tout le monde a déjà reçu son QR Code !" });

    let sentCount = 0;

    // 2. Boucle d'envoi
    for (const m of membres) {
      await transporter.sendMail({
        from: `"UNISP STAFF" <${process.env.EMAIL_USER}>`,
        to: m.email,
        subject: `Votre QR Code UNISP - ${m.nome}`,
        html: `
          <div style="font-family: sans-serif; text-align: center; background-color: #f8fafc; padding: 40px;">
            <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 30px; padding: 30px; border: 1px solid #e2e8f0;">
              <h2 style="color: #1e293b; margin-bottom: 5px; text-transform: uppercase;">Bonjour ${m.nome}</h2>
              <p style="color: #64748b; font-size: 14px;">Voici votre pass d'accès personnel pour l'UNISP.</p>
              <div style="margin: 30px 0;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${m.codice_qr}" style="border: 8px solid #f1f5f9; border-radius: 20px;" />
              </div>
              <p style="font-size: 24px; font-weight: 900; color: #2563eb; letter-spacing: 4px;">${m.codice_qr}</p>
              <p style="font-size: 11px; color: #94a3b8; text-transform: uppercase; margin-top: 20px;">Présentez ce code à l'entrée</p>
            </div>
          </div>
        `,
      });

      // 3. Marquer comme envoyé dans Supabase
      await supabase.from('membres').update({ mail_sent: true }).eq('id', m.id);
      sentCount++;
    }

    res.status(200).json({ success: true, count: sentCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}