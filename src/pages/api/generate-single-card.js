import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import nodemailer from "nodemailer";

// Inizializzazione Supabase con Service Role Key per permessi di scrittura
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Configurazione Transporter Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: process.env.EMAIL_SERVER_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Metodo non consentito" });

  const { memberId } = req.body;

  try {
    // 1. Recupera i dati del membro dal DB
    const { data: m, error: fetchError } = await supabase
      .from("membres")
      .select("*")
      .eq("id", memberId)
      .single();

    if (fetchError || !m) throw new Error("Membro non trovato");

    // 2. Carica lo sfondo (Template PNG dallo Storage) e converti in Base64
    const backgroundUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tessere/template-card.png`;

    let bgImageBase64;
    try {
      const bgResponse = await fetch(backgroundUrl);
      const bgBlob = await bgResponse.arrayBuffer();
      bgImageBase64 = Buffer.from(bgBlob).toString("base64");
    } catch (e) {
      throw new Error("Errore caricamento sfondo: " + e.message);
    }

    // 3. Generazione PDF con jsPDF
    // ... (Dopo il recupero del membro 'm')

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a6", // 105 x 148 mm
    });

    const w = 105;
    const h = 148;
    const annoCorrente = new Date().getFullYear();

    // 1. SFONDO GRADIENTE SIMULATO (Scuro professionale)
    doc.setFillColor(15, 23, 42); // Navy scuro (Slate 900)
    doc.rect(0, 0, w, h, "F");

    // 2. ELEMENTO GRAFICO DI DECORAZIONE (Cerchio sfumato in alto a destra)
    doc.setFillColor(37, 99, 235); // Blu brillante
    doc.setGState(new doc.GState({ opacity: 0.2 }));
    doc.circle(w, 0, 60, "F");
    doc.setGState(new doc.GState({ opacity: 1 }));

    // 3. LOGO UNISP (Posizionato con cura)
    try {
      const logoPath = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tessere/logo-unisp.png`;
      const logoRes = await fetch(logoPath);
      const logoBase64 = Buffer.from(await logoRes.arrayBuffer()).toString(
        "base64",
      );
      doc.addImage(logoBase64, "PNG", 10, 10, 18, 18);
    } catch (e) {}

    // 4. TESTO HEADER
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("UNISP • SYSTEM", 32, 18);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`Tessera Ufficiale ${annoCorrente}`, 32, 23);

    // 5. MAIN CARD (L'area centrale che contiene i dati)
    doc.setFillColor(30, 41, 59); // Slate 800
    doc.roundedRect(8, 35, w - 16, 105, 8, 8, "F");

    // 6. NOME E COGNOME (Grande impatto)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`${m.nome}`.toUpperCase(), w / 2, 50, {
      align: "center",
      maxWidth: w - 25,
    });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(`${m.cognome}`.toUpperCase(), w / 2, 56, {
      align: "center",
      maxWidth: w - 25,
    });

    // 7. BADGE TIPOLOGIA (Colorato in base al tipo)
    const isStaff = ["ADMIN", "STAFF"].includes(
      m.tipologia_socio?.toUpperCase(),
    );
    doc.setFillColor(isStaff ? 225 : 37, isStaff ? 29 : 99, isStaff ? 72 : 235); // Rosso se Staff, Blu se Socio
    doc.roundedRect(w / 2 - 15, 62, 30, 6, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text(m.tipologia_socio.toUpperCase(), w / 2, 66.2, {
      align: "center",
    });

    // 8. AREA QR CODE "GLOSS"
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(w / 2 - 25, 75, 50, 50, 6, 6, "F");

    const qrDataUrl = await QRCode.toDataURL(String(m.codice_qr), {
      margin: 1,
      width: 300,
    });
    doc.addImage(qrDataUrl, "PNG", w / 2 - 21, 79, 42, 42);

    // 9. CODICE QR TESTUALE (Sotto il box bianco)
    doc.setFontSize(8);
    doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setTextColor(255, 255, 255);
    doc.text(String(m.codice_qr), w / 2 - 10, 134, {
      align: "center",
      charSpace: 4,
    });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`SCADENZA: 31/12/${annoCorrente}`, w / 2, 145, {
      align: "center",
    });

    // 4. Trasformazione in Buffer e Caricamento su Supabase Storage
    const pdfOutput = doc.output("arraybuffer");
    const pdfBuffer = Buffer.from(pdfOutput);
    const fileName = `tessera_${m.id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("tessere")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // 5. Ottieni URL pubblico e aggiorna il database
    const {
      data: { publicUrl },
    } = supabase.storage.from("tessere").getPublicUrl(fileName);

    await supabase
      .from("membres")
      .update({ tessera_url: publicUrl })
      .eq("id", m.id);

    // 6. INVIO EMAIL CON NODEMAILER (Layout Designer)
    try {
      console.log(`[MAIL] Invio a: ${m.email}...`);

      await transporter.sendMail({
        from: `"STAFF UNISP" <${process.env.EMAIL_USER}>`,
        to: m.email,
        subject: `La tua Tessera Socio UNISP - ${m.nome}`,
        html: `
        <!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap" rel="stylesheet">
    <style>
        /* RESET STYLES */
        body { margin: 0; padding: 0; min-width: 100%; width: 100% !important; background-color: #ffffff; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }

        /* DESIGN STYLES */
        .wrapper { width: 100%; table-layout: fixed; background-color: #ffffff; }
        .main { background-color: #0f172a; width: 100%; max-width: 600px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.5); }
        
        .glow-bg { 
            background-color: #0f172a;
            background-image: radial-gradient(circle at 80% 20%, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0) 60%), 
                              radial-gradient(circle at 20% 80%, rgba(3, 105, 161, 0.2) 0%, rgba(15, 23, 42, 0) 60%); 
        }
        
        .header { padding: 40px 30px 20px 30px; text-align: left; }
        .brand-title { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase; }
        .brand-title span { color: #2550fc; font-weight: 400; }
        
        .welcome-band { background: linear-gradient(135deg, #0f172a 0%, #2550fc 100%); width: 100%; padding: 30px 20px; text-align: center; }
        .welcome-text { font-size: 32px; font-weight: 700; color: #ffffff; letter-spacing: -1.5px; line-height: 1.1; }

        .content { padding: 30px 30px 40px 30px; text-align: center; }
        p { font-size: 16px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px 0; }
        
        .button-container { padding: 20px 0; }
        .button { background-color: #2550fc; color: #ffffff !important; padding: 18px 40px; border-radius: 15px; text-decoration: none; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; display: inline-block; border: 1px solid rgba(255,255,255,0.1); }
        
        .footer { padding: 30px 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; background-color: rgba(3, 7, 18, 0.5); }
        .footer a { color: #2550fc; text-decoration: none; }
        
        /* RESPONSIVE */
        @media only screen and (max-width: 600px) {
            .main { width: 100% !important;}
            .header { padding: 30px 20px 15px 20px !important; }
            .welcome-text { font-size: 26px !important; }
            .content { padding: 25px 20px 30px 20px !important; }
            .button { width: 100% !important; padding: 18px 0 !important; box-sizing: border-box; }
            p { font-size: 15px !important; }
        }
    </style>
</head>
<body>
    <center class="wrapper">
        <table class="main" width="600" cellspacing="0" cellpadding="0" border="0">
            <tr>
                <td class="glow-bg">
                    <table width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td class="header">
                                <div class="brand-title">UNISP <span style="color: #ffffff;">SYSTEM</span></div>
                            </td>
                        </tr>
                        
                        <tr>
                            <td class="welcome-band">
                                <div class="welcome-text">Ciao ${m.nome}!</div>
                            </td>
                        </tr>
                        
                        <tr>
                            <td class="content">
                                <p>Siamo felici di confermare la tua registrazione come membro <strong>ATTIVO</strong> di UNISP per quest'anno. La tua tessera socio ufficiale è pronta!</p>
                                <p>Puoi scaricarla e stamparla cliccando il pulsante qui sotto.</p>
                                
                                <table width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td align="center" class="button-container">
                                            <a href="${publicUrl}" class="button" target="_blank">Scarica</a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="font-size: 13px; margin-top: 20px; margin-bottom: 0;">Presenta il tuo QR Code ad ogni accesso.</p>
                            </td>
                        </tr>
                        
                        <tr>
                            <td class="footer">
                                &copy; 2026 UNISP SYSTEM • Ferrara, Italia<br><br>
                                Se hai domande, contatta lo staff a <br>
                                <a href="mailto:universalstudyproject@gmail.com">support@unisp.it</a>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
`,
        attachments: [
          {
            filename: `Tessera_UNISP_${m.cognome}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });
      console.log(`✅ Tessera inviata con successo a ${m.email}`);
    } catch (emailErr) {
      console.error(`❌ Errore nell'invio email:`, emailErr.message);
      // Non lanciamo l'errore per permettere la risposta successiva (il PDF è comunque pronto)
    }

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("ERRORE API DETTAGLIATO:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
