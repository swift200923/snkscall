import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Only POST allowed", { status: 405 });
  }

  const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!BOT_TOKEN || !CHAT_ID) {
    return new Response(
      JSON.stringify({ error: "Telegram secrets missing" }),
      { status: 500 }
    );
  }

  let text = "🔔 New message received. Open the chat.";

  try {
    const body = await req.json();
    if (body?.text) text = body.text;
  } catch (_) {}

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
      }),
    }
  );

  const result = await res.json();

  return new Response(
    JSON.stringify({ ok: true, telegram: result }),
    { headers: { "Content-Type": "application/json" } }
  );
});
