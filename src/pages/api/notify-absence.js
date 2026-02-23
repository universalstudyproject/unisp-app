import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Metodo non consentito' });

  const { type, email, nome } = req.body;

  if (!email) return res.status(400).json({ message: 'Email mancante' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Configurazione dei messaggi in base al tipo (4 o 5 assenze)
  const isSuspension = type === "SUSPENSION";
  
  const subject = isSuspension 
    ? `AVVISO IMPORTANTE: Sospensione Account UNISP - ${nome}`
    : `Promemoria Assenze UNISP - ${nome}`;

  const htmlContent = isSuspension ? `
    <div style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #fff1f2;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 20px; padding: 30px; border: 2px solid #be123c;">
        <h1 style="color: #be123c;">Account Sospeso</h1>
        <p style="color: #444; font-size: 16px;">Ciao <strong>${nome}</strong>,</p>
        <p style="color: #444;">Ti informiamo che hai raggiunto il limite massimo di <b>5 assenze</b>.</p>
        <p style="background: #be123c; color: white; padding: 15px; border-radius: 10px; font-weight: bold;">
          Il tuo QR Code è stato disattivato automaticamente.
        </p>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          Per riattivare la tua iscrizione, ti preghiamo di contattare la segreteria o lo staff dell'UNISP.
        </p>
      </div>
    </div>
  ` : `
    <div style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #fefce8;">
      <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 20px; padding: 30px; border: 2px solid #eab308;">
        <h1 style="color: #854d0e;">Avviso Assenze</h1>
        <p style="color: #444; font-size: 16px;">Ciao <strong>${nome}</strong>,</p>
        <p style="color: #444;">Abbiamo registrato <b>4 assenze</b> a tuo nome.</p>
        <p style="color: #854d0e; font-weight: bold;">
          Attenzione: alla prossima assenza (la quinta), il tuo account verrà sospeso automaticamente.
        </p>
        <p style="color: #666; font-size: 13px; margin-top: 20px;">
          Ti aspettiamo alla prossima attività per mantenere attivo il tuo pass!
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"STAFF UNISP" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    res.status(200).json({ success: true, message: `Email di ${type} inviata correttamente` });
  } catch (error) {
    console.error("Errore invio mail:", error);
    res.status(500).json({ error: error.message });
  }
}