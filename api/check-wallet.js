// /pages/api/check-wallet.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // лучше service_role, чтобы мог читать без RLS
);

export default async function handler(req, res) {
  const { wallet, userId } = req.query;

  if (!wallet || !userId) {
    return res.status(400).json({ allowed: false, error: "wallet или userId не указаны" });
  }

  try {
    // Ищем кошелёк в базе
    const { data, error } = await supabase
      .from("wallet_links")
      .select("wallet")
      .eq("userId", userId)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows found
      console.error("Supabase error:", error);
      return res.status(500).json({ allowed: false, error: "Ошибка сервера" });
    }

    // Если кошелёк найден — проверяем соответствие
    if (data && data.wallet === wallet) {
      return res.status(200).json({ allowed: true });
    }

    return res.status(403).json({ allowed: false, error: "Кошелёк не привязан к этому аккаунту" });
  } catch (err) {
    console.error("check-wallet error:", err);
    return res.status(500).json({ allowed: false, error: "Ошибка проверки кошелька" });
  }
}
