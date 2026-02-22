import { supabase } from "@/lib/supabase";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { data, dateFile } = req.body;

  // Préparation des lignes pour la table 'alimenti'
  const rowsToInsert = data.map(item => ({
    prodotto: item.prodotto,
    quantita: item.quantita,
    unita_metrica: item.unita,
    data_distribuzione: dateFile // La date extraite du fichier
  }));

  const { error } = await supabase.from('alimenti').insert(rowsToInsert);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}