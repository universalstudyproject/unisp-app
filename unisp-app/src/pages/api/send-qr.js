import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { email, nome, qrCode } = req.body;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"UNISP STAFF" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Il tuo QR Code UNISP - ${nome}`,
      html: `
        <div style="font-family: sans-serif; text-align: center;">
          <h2>Ciao ${nome},</h2>
          <p>Ecco il tuo codice d'accesso:</p>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}" />
          <p style="font-size: 20px; font-weight: bold;">${qrCode}</p>
        </div>
      `,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}