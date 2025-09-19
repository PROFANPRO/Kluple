// /pages/api/link-wallet.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_RULE_KEY // ✅ используем сервисный ключ
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
    // 1. Проверяем, не привязан ли кошелёк к другому пользователю
    const { data: existingWallets, error: checkError } = await supabase
      .from("wallet_links")
      .select("*")
      .eq("wallet", wallet);

    if (checkError) throw checkError;

    if (existingWallets.length > 0 && existingWallets[0].user_id !== userId) {
      return res
        .status(400)
        .json({ error: "Этот кошелёк уже привязан к другому аккаунту" });
    }

    // 2. Если этот же userId уже привязан — просто возвращаем успех
    if (existingWallets.length > 0 && existingWallets[0].user_id === userId) {
      console.log(`[link-wallet] user ${userId} уже привязан к ${wallet}`);
      return res.status(200).json({ success: true, wallet });
    }

    // 3. Создаём или обновляем запись
    const { error } = await supabase
      .from("wallet_links")
      .upsert({ user_id: userId, wallet }, { onConflict: "user_id" });

    if (error) throw error;

    console.log(`[link-wallet] user ${userId} привязал ${wallet}`);
    return res.status(200).json({ success: true, wallet });

  } catch (err) {
    console.error("link-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при привязке кошелька" });
  }
}
