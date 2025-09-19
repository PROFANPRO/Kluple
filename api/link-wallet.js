// /pages/api/link-wallet.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
    // 1. Проверяем, не привязан ли этот кошелёк к другому пользователю
    const { data: existingWallets, error: checkError } = await supabase
      .from("wallet_links")
      .select("user_id")
      .eq("wallet", wallet);

    if (checkError) throw checkError;

    if (existingWallets.length > 0 && existingWallets[0].user_id !== userId) {
      return res.status(400).json({
        error: "Этот кошелёк уже привязан к другому аккаунту"
      });
    }

    // 2. Удаляем старую привязку для этого userId (чтобы не дублировалось)
    await supabase.from("wallet_links").delete().eq("user_id", userId);

    // 3. Создаём новую привязку
    const { error: insertError } = await supabase
      .from("wallet_links")
      .insert([{ user_id: userId, wallet }]);

    if (insertError) throw insertError;

    console.log(`[link-wallet] user ${userId} привязал ${wallet}`);
    return res.status(200).json({ success: true, wallet });

  } catch (err) {
    console.error("link-wallet error:", err);
    return res.status(500).json({ error: "Ошибка при привязке кошелька" });
  }
}
