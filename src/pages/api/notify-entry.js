import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { email, nome, numero_giornaliero } = req.body;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"UNISP Accesso" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Conferma Ingresso UNISP - N° ${numero_giornaliero}`,
      html: `
        <div style="font-family: sans-serif; text-align: center; background-color: #f8fafc; padding: 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 20px; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b;">Ciao ${nome}!</h2>
            <p style="color: #64748b;">Il tuo ingresso è stato registrato correttamente.</p>
            <div style="margin: 20px 0; background: #2563eb; color: white; padding: 20px; border-radius: 15px;">
              <p style="font-size: 12px; text-transform: uppercase; margin: 0;">Il tuo numero di oggi è</p>
              <h1 style="font-size: 48px; margin: 0;">${numero_giornaliero}</h1>
            </div>
            <p style="font-size: 12px; color: #94a3b8;">${new Date().toLocaleString('it-IT')}</p>
          </div>
        </div>
      `,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}