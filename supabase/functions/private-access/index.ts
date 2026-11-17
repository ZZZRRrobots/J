
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = Deno.env.get("SESSION_PEPPER");

  if (!url || !serviceKey || !pepper) {
    console.error("Missing required environment secrets.");
    return json({ error: "Server configuration error." }, 500);
  }

  const client = createClient(url, serviceKey);

  try {
    const body = await req.json();
    const action = body.action;

    // LOGIN
    if (action === "login") {
      const pin = String(body.pin || "");

      if (!/^\d{4}$/.test(pin)) {
        return json({ error: "Enter a valid four-digit code." }, 400);
      }

      const ip = req.headers.get("x-forwarded-for") || "unknown";
      const ipHash = await hash(ip + pepper);

      const since = new Date(
        Date.now() - 15 * 60 * 1000
      ).toISOString();

      const { count, error: countError } = await client
        .from("private_login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since);

      if (countError) throw countError;

      if ((count || 0) >= 8) {
        return json({
          error: "Too many attempts. Please try again in 15 minutes."
        }, 429);
      }

      const yourPin = Deno.env.get("USER_ONE_PIN") || "";
      const herPin = Deno.env.get("USER_TWO_PIN") || "";

      let person = "";

      if (yourPin && equal(pin, yourPin)) {
        person = "you";
      } else if (herPin && equal(pin, herPin)) {
        person = "jaidaa";
      }

      if (!person) {
        const { error } = await client
          .from("private_login_attempts")
          .insert({ ip_hash: ipHash });

        if (error) throw error;

        return json({ error: "That code isn't correct." }, 401);
      }

      await client
        .from("private_login_attempts")
        .delete()
        .eq("ip_hash", ipHash);

      const token = randomToken();
      const tokenHash = await hash(token + pepper);

      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error } = await client
        .from("private_sessions")
        .insert({
          token_hash: tokenHash,
          person,
          expires_at: expiresAt
        });

      if (error) throw error;

      return json({
        success: true,
        token,
        person,
        expiresAt
      });
    }

    // VERIFY SESSION
    // Every private chat action must pass through this check.
    if (
      action === "verify" ||
      action === "logout" ||
      action === "list_messages" ||
      action === "send_message"
    ) {
      const token = String(body.token || "");

      if (!token || token.length > 200) {
        return json({ error: "Invalid session." }, 401);
      }

      const tokenHash = await hash(token + pepper);

      const { data: session, error: sessionError } = await client
        .from("private_sessions")
        .select("person, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (!session) {
        return json({ error: "Session not found." }, 401);
      }

      if (new Date(session.expires_at).getTime() <= Date.now()) {
        await client
          .from("private_sessions")
          .delete()
          .eq("token_hash", tokenHash);

        return json({ error: "Session expired." }, 401);
      }

      const person = session.person;

      // LOGOUT
      if (action === "logout") {
        await client
          .from("private_sessions")
          .delete()
          .eq("token_hash", tokenHash);

        return json({ success: true });
      }

      // VERIFY
      if (action === "verify") {
        return json({
          success: true,
          person,
          expiresAt: session.expires_at
        });
      }

      // LIST PRIVATE MESSAGES
      if (action === "list_messages") {
        const { data, error } = await client
          .from("private_messages")
          .select("id, sender, recipient, body, created_at")
          .or(
            "and(sender.eq.you,recipient.eq.jaidaa),and(sender.eq.jaidaa,recipient.eq.you)"
          )
          .order("created_at", { ascending: true })
          .limit(200);

        if (error) throw error;

        return json({
          success: true,
          messages: data || []
        });
      }

      // SEND PRIVATE MESSAGE
      if (action === "send_message") {
        const message = String(body.message || "").trim();

        if (!message || message.length > 2000) {
          return json({
            error: "Messages must contain between 1 and 2000 characters."
          }, 400);
        }

        // Basic per-person sending limit: 20 messages per minute.
        const since = new Date(
          Date.now() - 60 * 1000
        ).toISOString();

        const { count, error: countError } = await client
          .from("private_messages")
          .select("*", { count: "exact", head: true })
          .eq("sender", person)
          .gte("created_at", since);

        if (countError) throw countError;

        if ((count || 0) >= 20) {
          return json({
            error: "Please wait a moment before sending more messages."
          }, 429);
        }

        // The server chooses the sender and recipient.
        const recipient = person === "you" ? "jaidaa" : "you";

        const { data, error } = await client
          .from("private_messages")
          .insert({
            sender: person,
            recipient,
            body: message
          })
          .select("id, sender, recipient, body, created_at")
          .single();

        if (error) throw error;

        return json({
          success: true,
          message: data
        });
      }
    }

    return json({ error: "Unknown action." }, 400);

  } catch (error) {
    console.error(error);
    return json({ error: "Something went wrong." }, 500);
  }
});
    
