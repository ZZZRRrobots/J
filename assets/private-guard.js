const SUPABASE_URL = "https://xevucdvjsezroxdqdjtz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_OmnPPdFOmkn2PTinT_xxuA_kz_WtySy";

const SESSION_KEY = "private_universe_session";
const PERSON_KEY = "private_universe_person";
const EXPIRY_KEY = "private_universe_expiry";

const API_URL = `${SUPABASE_URL}/functions/v1/bright-handler`;

async function privateRequest(action, token) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ action, token })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Session verification failed.");
  }

  return data;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PERSON_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

function redirectToLogin() {
  const next = encodeURIComponent(
    window.location.pathname.split("/").pop() || "Messages.html"
  );

  window.location.replace(`Login.html?next=${next}`);
}

function createLogoutButton() {
  if (document.getElementById("private-logout-button")) return;

  const button = document.createElement("button");

  button.id = "private-logout-button";
  button.textContent = "↗ Logout";

  Object.assign(button.style, {
    position: "fixed",
    top: "18px",
    right: "18px",
    zIndex: "99999",
    padding: "10px 18px",
    borderRadius: "12px",
    border: "1px solid rgba(100,180,255,.4)",
    background: "rgba(8,20,45,.85)",
    color: "#d8ecff",
    fontSize: "13px",
    cursor: "pointer",
    backdropFilter: "blur(12px)"
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Logging out...";

    const token = localStorage.getItem(SESSION_KEY);

    try {
      if (token) {
        await privateRequest("logout", token);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearSession();
      window.location.replace("Login.html");
    }
  });

  document.body.appendChild(button);
}

async function protectPrivatePage() {
  document.documentElement.style.visibility = "hidden";

  const token = localStorage.getItem(SESSION_KEY);

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const data = await privateRequest("verify", token);

    if (!data.success) {
      throw new Error("Invalid session.");
    }

    localStorage.setItem(PERSON_KEY, data.person);
    localStorage.setItem(EXPIRY_KEY, data.expiresAt);

    document.documentElement.style.visibility = "visible";

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createLogoutButton);
    } else {
      createLogoutButton();
    }

  } catch (error) {
    console.error("Private access error:", error);
    clearSession();
    redirectToLogin();
  }
}

protectPrivatePage();
