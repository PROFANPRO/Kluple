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
    // ✅ Удаляем любую старую привязку по user_id
    await supabase.from("wallet_links").delete().eq("user_id", userId);

    // ✅ Вставляем новую запись
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
