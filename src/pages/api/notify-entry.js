import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { email, nome, numero_giornaliero } = req.body;

  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dataTesto = now.toLocaleDateString('it-IT', options);
  const oraTesto = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // --- CONFIGURAZIONE DESIGN PER MESE ---
  const configMesi = [
    { nome: 'Gennaio', colore: '#3b82f6', icona: '❄️' },   // Blu
    { nome: 'Febbraio', colore: '#ef4444', icona: '❤️' },  // Rosso
    { nome: 'Marzo', colore: '#10b981', icona: '🌱' },    // Verde primavera
    { nome: 'Aprile', colore: '#f59e0b', icona: '🐣' },   // Arancione
    { nome: 'Maggio', colore: '#ec4899', icona: '🌸' },   // Rosa
    { nome: 'Giugno', colore: '#facc15', icona: '☀️' },   // Giallo
    { nome: 'Luglio', colore: '#06b6d4', icona: '🌊' },   // Turchese
    { nome: 'Agosto', colore: '#f97316', icona: '🔥' },   // Arancio scuro
    { nome: 'Settembre', colore: '#8b5cf6', icona: '🍇' }, // Viola
    { nome: 'Ottobre', colore: '#78350f', icona: '🍂' },  // Marrone
    { nome: 'Novembre', colore: '#475569', icona: '☁️' },  // Grigio
    { nome: 'Dicembre', colore: '#1e3a8a', icona: '🎄' }   // Blu notte
  ];

  const design = configMesi[now.getMonth()];

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"UNISP Accesso" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${design.icona} N° ${numero_giornaliero} - ${design.nome.toUpperCase()}`,
      html: `
        <div style="font-family: 'Helvetica', sans-serif; text-align: center; background-color: #f1f5f9; padding: 20px;">
          <div style="max-width: 450px; margin: 0 auto; background: white; border-radius: 40px; padding: 40px; border: 8px solid ${design.colore};">
            
            <div style="margin-bottom: 25px;">
                <p style="color: ${design.colore}; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; margin: 0;">
                    ACCESSO RISERVATO - ${design.nome}
                </p>
                <h1 style="color: #1e293b; font-size: 28px; font-weight: 900; text-transform: uppercase; margin: 5px 0;">
                    ${dataTesto}
                </h1>
                <div style="display: inline-block; background: ${design.colore}; color: white; padding: 5px 20px; border-radius: 50px; font-weight: bold; font-size: 18px; margin-top: 10px;">
                    ORE ${oraTesto}
                </div>
            </div>

            <div style="background: #1e293b; color: white; border-radius: 35px; padding: 50px 20px; margin: 30px 0; border: 4px solid ${design.colore};">
              <p style="font-size: 16px; text-transform: uppercase; font-weight: 800; margin: 0; color: ${design.colore}; letter-spacing: 2px;">Numero di Turno</p>
              <h1 style="font-size: 130px; margin: 5px 0; line-height: 1; font-weight: 900; color: white;">${numero_giornaliero}</h1>
              <p style="margin-top: 10px; font-size: 12px; font-weight: bold; text-transform: uppercase; opacity: 0.7;">Presentare questo ticket allo staff</p>
            </div>

            <div style="text-align: center;">
                <h3 style="color: #1e293b; font-size: 22px; margin-bottom: 5px;">Ciao ${nome}!</h3>
                <p style="color: #64748b; font-size: 15px; line-height: 1.4;">
                    Il tuo ingresso è stato registrato correttamente per l'attività di oggi.
                </p>
            </div>
            
          </div>
          <p style="font-size: 11px; color: #94a3b8; margin-top: 25px; text-transform: uppercase;">
            &copy; UNISP - Controllo Validità Mensile
          </p>
        </div>
      `,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}