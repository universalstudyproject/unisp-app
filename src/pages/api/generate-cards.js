import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { createCanvas, loadImage } from "canvas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1. Prendi i membri ATTIVI che non hanno ancora la tessera
    const { data: membres, error: fetchError } = await supabase
      .from("membres")
      .select("*")
      .eq("stato", "ATTIVO")
      .is("tessera_url", null);

    if (fetchError) throw fetchError;
    if (!membres || membres.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        message: "Tutte le tessere sono già state generate.",
      });
    }

    // 2. Carica lo sfondo (assicurati che il path sia corretto)
    // Se lo carichi su Supabase Storage, usa l'URL pubblico.
    const backgroundUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tessere/template-card.png`;
    const bgImage = await loadImage(backgroundUrl);
    const annoCorrente = new Date().getFullYear();

    let generatedCount = 0;

    for (const m of membres) {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [85, 120], // Formato tessera grande
      });

      doc.deletePage(1);
      doc.addPage([85, 120], "portrait");

      // A. Aggiungi Sfondo
      doc.addImage(bgImage, "PNG", 0, 0, 85, 120);

      // B. Genera QR Code come DataURL
      const qrDataUrl = await QRCode.toDataURL(m.codice_qr, {
        margin: 1,
        width: 400,
      });

      // C. Aggiungi Testi e QR
      doc.setTextColor(30, 41, 59); // Slate 800

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`TESSERA SOCIO ${annoCorrente}`, 42.5, 30, { align: "center" });

      doc.setFontSize(9);
      doc.text(`${m.nome.toUpperCase()}`, 42.5, 40, {
        align: "center",
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Membro ${m.tipologia_socio.toUpperCase()}`, 42.5, 46, {
        align: "center",
      });

      // QR Code centrale
      doc.addImage(qrDataUrl, "PNG", 22.5, 55, 40, 40);

      // Codice Testo
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(m.codice_qr, 42.5, 102, { align: "center", charSpace: 3 });

      // Scadenza e Note
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`SCADENZA: 31 DICEMBRE ${annoCorrente}`, 42.5, 110, {
        align: "center",
      });
      doc.text("Presentare questo codice ad ogni accesso.", 42.5, 114, {
        align: "center",
      });

      // 3. Converti PDF in Buffer
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

      // 4. Carica su Supabase Storage
      const fileName = `tessera_${m.id}_${new Date().getTime()}.pdf`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("tessere")
        .upload(fileName, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
          cacheControl: '0'
        });

      if (uploadError) throw uploadError;

      // 5. Ottieni URL Pubblico e aggiorna DB
      const {
        data: { publicUrl },
      } = supabase.storage.from("tessere").getPublicUrl(fileName);

      await supabase
        .from("membres")
        .update({ tessera_url: publicUrl })
        .eq("id", m.id);

      generatedCount++;
    }

    res.status(200).json({ success: true, count: generatedCount });
  } catch (err) {
    console.error("Errore Generazione:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
