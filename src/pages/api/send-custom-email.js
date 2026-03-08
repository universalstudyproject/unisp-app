import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { email, nomeMembro, subject, message, allegatoUrl } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({ success: false, message: "Dati mancanti" });
  }

  // 1. CONFIGURAZIONE TRASPORTATORE (Configura con le tue credenziali)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 2. DESIGN DEL CORPO EMAIL (Cyber-Glow Moderno)
  const htmlContent = `
  <!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* RESET STYLES */
        body { margin: 0; padding: 0; min-width: 100%; width: 100% !important; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: Arial, sans-serif; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
        
        /* DESIGN STYLES */
        .wrapper { width: 100%; table-layout: fixed; background-color: #ffffff; padding: 20px 0; }
        .main { background-color: #0f172a; width: 100%; max-width: 600px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
        
        /* Forza lo sfondo scuro e i gradienti */
        .glow-bg { 
            background-color: #0f172a !important;
            background-image: radial-gradient(circle at 80% 20%, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0) 60%), 
                              radial-gradient(circle at 20% 80%, rgba(37, 80, 252, 0.2) 0%, rgba(15, 23, 42, 0) 60%) !important;
        }
        
        .header { padding: 40px 30px 20px 30px; text-align: left; }
        .brand-title { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase; margin: 0; }
        
        .welcome-band { 
            background: #2550fc linear-gradient(135deg, #0f172a 0%, #2550fc 100%) !important; 
            width: 100%; 
            padding: 35px 20px; 
            text-align: center; 
        }
        .welcome-text { font-size: 32px; font-weight: 700; color: #ffffff !important; letter-spacing: -1.5px; line-height: 1.1; margin: 0; }

        .content { padding: 35px 30px 40px 30px; text-align: center; }
        .text-msg { font-size: 16px; line-height: 1.6; color: #94a3b8 !important; margin: 0 0 25px 0; white-space: pre-line; }
        
        .button-container { padding: 20px 0; }
        .button { background-color: #2550fc !important; color: #ffffff !important; padding: 18px 40px; border-radius: 15px; text-decoration: none; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; display: inline-block; }
        
        .footer { padding: 30px 20px; text-align: center; font-size: 12px; color: #64748b !important; border-top: 1px solid #334155; background-color: rgba(3, 7, 18, 0.5); }
        
        /* RESPONSIVE */
        @media only screen and (max-width: 600px) {
            .main { width: 100% !important; }
            .header { padding: 30px 20px 15px 20px !important; }
            .welcome-text { font-size: 26px !important; }
            .button { width: 100% !important; padding: 18px 0 !important; box-sizing: border-box; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="600" cellspacing="0" cellpadding="0" border="0" align="center">
            <tr>
                <td class="glow-bg" bgcolor="#0f172a">
                    <table width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td class="header">
                                <h2 class="brand-title">UNISP <span style="color: #ffffff; font-weight: 400;">SYSTEM</span></h2>
                            </td>
                        </tr>
                        
                        <tr>
                            <td class="welcome-band" bgcolor="#2550fc">
                                <div class="welcome-text">Ciao ${nomeMembro}!</div>
                            </td>
                        </tr>
                        
                        <tr>
                            <td class="content">
                                <div class="text-msg">${message}</div>
                                
                                ${
                                  allegatoUrl
                                    ? `
                                <table width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td align="center" class="button-container">
                                            <a href="${allegatoUrl}" class="button" target="_blank">Apri Allegato</a>
                                        </td>
                                    </tr>
                                </table>
                                `
                                    : ""
                                }
                               </td>
                        </tr>
                        
                        <tr>
                            <td class="footer">
                                &copy; 2026 UNISP SYSTEM • Ferrara, Italia<br><br>
                                Se hai domande, contatta lo staff a <br>
                                <a href="mailto:universalstudyproject@gmail.com" style="color: #2550fc; text-decoration: none;">support@unisp.it</a>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
  `;

  try {
    // 3. INVIO EMAIL
    await transporter.sendMail({
      from: `"UNISP SYSTEM" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: htmlContent,
    });

    return res.status(200).json({ success: true, message: "Email inviata" });
  } catch (error) {
    console.error("Errore invio mail:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
