
"use strict";

/* =====================================
   PRIVATE UNIVERSE — MESSAGES
===================================== */

const SUPABASE_URL =
  "https://xevucdvjsezroxdqdjtz.supabase.co";

const SUPABASE_ANON_KEY =
  "YOUR_EXISTING_PUBLISHABLE_KEY";

const API_URL =
  `${SUPABASE_URL}/functions/v1/bright-handler`;

const SESSION_KEY = "private_universe_session";
const PERSON_KEY = "private_universe_person";
const EXPIRY_KEY = "private_universe_expiry";

let currentPerson = null;
let lastMessageId = null;
let isSending = false;
let isLoading = false;
let refreshTimer = null;
let hasLoadedMessages = false;

/* =====================================
   ELEMENTS
===================================== */

let messagesBox;
let input;
let form;
let sendButton;
let statusText;

/* =====================================
   STATUS
===================================== */

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

/* =====================================
   SESSION CLEANUP
===================================== */

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PERSON_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

function redirectToLogin() {
  location.replace("Login.html");
}

/* =====================================
   PLACEHOLDER
===================================== */

function showPlaceholder(message) {
  if (!messagesBox) return;

  const empty = document.createElement("div");
  empty.className = "empty";

  const symbol = document.createElement("span");
  symbol.className = "symbol";
  symbol.textContent = "✧";

  const text = document.createElement("div");
  text.textContent = message;

  empty.append(symbol, text);
  messagesBox.replaceChildren(empty);
}

/* =====================================
   API REQUEST
===================================== */

async function api(action, extra = {}) {
  const token = localStorage.getItem(SESSION_KEY);

  if (!token) {
    throw new Error(
      "Your login session is missing. Please log in again."
    );
  }

  let response;

  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        action,
        token,
        ...extra
      })
    });
  } catch (error) {
    throw new Error(
      "Network connection failed. Check your internet connection."
    );
  }

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "The server returned an invalid response."
    );
  }

  if (response.status === 401) {
    clearSession();
    redirectToLogin();

    throw new Error(
      "Your session expired. Please log in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Server error (${response.status}).`
    );
  }

  return data;
}

/* =====================================
   TIME FORMAT
===================================== */

function formatTime(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* =====================================
   CREATE MESSAGE ELEMENT
===================================== */

function createMessage(message) {
  const mine = message.sender === currentPerson;

  const row = document.createElement("div");

  row.className =
    "message-row" + (mine ? " mine" : "");

  const sender = document.createElement("div");
  sender.className = "sender";
  sender.textContent = mine ? "You" : "Jaidaa";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.body;

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = formatTime(message.created_at);

  row.append(sender, bubble, time);

  return row;
}

/* =====================================
   LOAD MESSAGES
===================================== */

async function loadMessages() {
  if (isLoading) return;

  isLoading = true;

  try {
    const data = await api("list_messages");

    if (
      !data.success ||
      !Array.isArray(data.messages)
    ) {
      throw new Error(
        "Unexpected response from the messages server."
      );
    }

    const list = data.messages;

    const newLastId = list.length
      ? list[list.length - 1].id
      : null;

    const existingCount =
      messagesBox.querySelectorAll(".message-row").length;

    if (
      hasLoadedMessages &&
      newLastId === lastMessageId &&
      list.length === existingCount
    ) {
      return;
    }

    const wasNearBottom =
      messagesBox.scrollHeight -
      messagesBox.scrollTop -
      messagesBox.clientHeight < 100;

    const fragment =
      document.createDocumentFragment();

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";

      const symbol = document.createElement("span");
      symbol.className = "symbol";
      symbol.textContent = "✧";

      const text = document.createElement("div");
      text.textContent =
        "Your conversation starts here. Send the first message.";

      empty.append(symbol, text);
      fragment.appendChild(empty);
    } else {
      list.forEach(message => {
        fragment.appendChild(createMessage(message));
      });
    }

    messagesBox.replaceChildren(fragment);

    lastMessageId = newLastId;
    hasLoadedMessages = true;

    if (wasNearBottom || list.length <= 1) {
      messagesBox.scrollTop =
        messagesBox.scrollHeight;
    }

    setStatus("Your private conversation ✦");

  } catch (error) {
    console.error("Load messages error:", error);

    setStatus(
      "Couldn't load messages: " + error.message
    );

    if (!hasLoadedMessages) {
      showPlaceholder(
        "Unable to load your conversation. Please try again."
      );
    }

  } finally {
    isLoading = false;
  }
}

/* =====================================
   SEND MESSAGE
===================================== */

async function sendMessage(event) {
  event.preventDefault();

  const message = input.value.trim();

  if (!message || isSending) return;

  isSending = true;
  sendButton.disabled = true;

  setStatus("Sending your message...");

  try {
    const result = await api(
      "send_message",
      { message }
    );

    if (!result.success) {
      throw new Error(
        result.error ||
        "The server did not confirm your message."
      );
    }

    input.value = "";
    input.style.height = "auto";

    lastMessageId = null;

    await loadMessages();

    setStatus("Message sent ✦");

  } catch (error) {
    console.error("Send message error:", error);

    setStatus(
      "Couldn't send: " + error.message
    );

  } finally {
    isSending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

/* =====================================
   INPUT EVENTS
===================================== */

function setupInput() {
  input.addEventListener("input", () => {
    input.style.height = "auto";

    input.style.height =
      Math.min(input.scrollHeight, 120) + "px";
  });

  input.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", sendMessage);
}

/* =====================================
   START CHAT
===================================== */

async function startChat() {
  try {
    setStatus("Checking your session...");

    showPlaceholder(
      "Connecting to your private universe..."
    );

    const verified = await api("verify");

    if (
      !verified.success ||
      !verified.person
    ) {
      throw new Error(
        "Could not verify your account."
      );
    }

    currentPerson = verified.person;

    localStorage.setItem(
      PERSON_KEY,
      currentPerson
    );

    setStatus("Loading your conversation...");

    await loadMessages();

    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(() => {
      loadMessages();
    }, 5000);

  } catch (error) {
    console.error("Chat startup error:", error);

    setStatus(
      "Connection failed: " + error.message
    );

    showPlaceholder(
      "We couldn't connect to your conversation."
    );
  }
}

/* =====================================
   INITIALIZE
===================================== */

function initializeMessages() {
  messagesBox = document.getElementById("messages");
  input = document.getElementById("messageInput");
  form = document.getElementById("messageForm");
  sendButton = document.getElementById("sendButton");
  statusText = document.getElementById("status");

  if (
    !messagesBox ||
    !input ||
    !form ||
    !sendButton ||
    !statusText
  ) {
    console.error(
      "Messages initialization failed: HTML elements are missing."
    );

    return;
  }

  // Confirm that this file is executing.
  setStatus("Messages script loaded. Connecting...");

  setupInput();
  startChat();
}

document.addEventListener(
  "DOMContentLoaded",
  initializeMessages
);
  
