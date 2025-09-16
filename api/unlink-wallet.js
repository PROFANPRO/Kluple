// /pages/api/unlink-wallet.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ✅ лучше service_role ключ
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не поддерживается" });
  }

  const { userId, wallet } = req.body;

  if (!userId || !wallet) {
    return res.status(400).json({ error: "Не указан userId или wallet" });
  }

  try {
    // Удаляем запись из таблицы wallet_links
    const { error } = await supabase
      .from("wallet_links")
      .delete()
      .match({ user_id: userId, wallet }); // ✅ используем user_id

    if (error) {
      console.error("Supabase unlink error:", error);
      return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
    }

    console.log(`🔓 Кошелёк ${wallet} отвязан от userId ${userId}`);
    return res.status(200).json({ success: true, message: "Кошелёк отвязан" });
  } catch (err) {
    console.error("unlink-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при отвязке кошелька" });
  }
}
