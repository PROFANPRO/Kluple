// /pages/api/check-wallet.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // используем сервисный ключ, чтобы читать без ограничений
);

export default async function handler(req, res) {
  const { wallet, userId } = req.query;

  if (!wallet || !userId) {
    return res.status(400).json({ allowed: false, error: "wallet или userId не указаны" });
  }

  try {
    // Ищем по user_id
    const { data, error } = await supabase
      .from("wallet_links")
      .select("wallet")
      .eq("user_id", userId)
      .single();

    // Если ошибка не "нет строк" → значит реально проблема
    if (error && error.code !== "PGRST116") {
      console.error("Supabase error:", error);
      return res.status(500).json({ allowed: false, error: "Ошибка сервера" });
    }

    if (data?.wallet === wallet) {
      return res.status(200).json({ allowed: true });
    }

    return res.status(403).json({ allowed: false, error: "Кошелёк не привязан к этому аккаунту" });
  } catch (err) {
    console.error("check-wallet error:", err);
    return res.status(500).json({ allowed: false, error: "Ошибка проверки кошелька" });
  }
}
