import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // 1. EXTRAIRE LES DONNÉES DU BODY
  // On ajoute 'allegatiUrls' pour gérer le multi-fichiers
  const { email, nomeMembro, subject, message, allegatoUrl, allegatiUrls } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({ success: false, message: "Dati mancanti" });
  }

  // 2. PRÉPARER LES PIÈCES JOINTES (ATTACHMENTS)
  let attachments = [];

  // Si on reçoit un tableau d'URLs (Multi-fichiers)
  if (allegatiUrls && Array.isArray(allegatiUrls)) {
    attachments = allegatiUrls.map((url) => ({
      filename: url.split("/").pop().split("?")[0], // Nettoie le nom du fichier (enlève les query params Supabase)
      path: url,
    }));
  } 
  // Si on reçoit juste une seule URL (Ancienne méthode)
  else if (allegatoUrl) {
    attachments.push({
      filename: allegatoUrl.split("/").pop().split("?")[0],
      path: allegatoUrl,
    });
  }

  // 3. CONFIGURAZIONE TRASPORTATORE
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 4. DESIGN HTML (Adapté pour afficher des boutons pour chaque fichier)

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, sans-serif; }
            .main { background-color: #0f172a; width: 100%; max-width: 600px; margin: 0 auto; }
            .header { padding: 40px 30px; text-align: left; color: #ffffff; }
            .welcome-band { background: #2550fc; padding: 35px 20px; text-align: center; color: #ffffff; }
            .content { padding: 35px 30px; text-align: center; color: #94a3b8; }
            .footer { padding: 30px 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
        </style>
    </head>
    <body>
        <table class="main" width="600" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
                <td bgcolor="#0f172a">
                    <div class="header">
                        <h2 style="margin:0;">UNISP <span style="font-weight:400;">SYSTEM</span></h2>
                    </div>
                    <div class="welcome-band">
                        <h1 style="margin:0; font-size:28px;">Ciao ${nomeMembro}!</h1>
                    </div>
                    <div class="content">
                        <div style="white-space: pre-line; margin-bottom: 30px;">${message}</div>
                    </div>
                    <div class="footer">
                        &copy; ${new Date().getFullYear()} UNISP SYSTEM • Ferrara, Italia
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
  `;

  try {
    // 5. INVIO EMAIL
    await transporter.sendMail({
      from: `"UNISP SYSTEM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: htmlContent,
      attachments: attachments, // Nodemailer les envoie en tant que vraies pièces jointes
    });

    return res.status(200).json({ success: true, message: "Email inviata" });
  } catch (error) {
    console.error("Errore invio mail:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}