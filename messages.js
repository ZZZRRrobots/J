"use strict";

const SUPABASE_URL = "https://xevucdvjsezroxdqdjtz.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_OmnPPdFOmkn2PTinT_xxuA_kz_WtySy";

const API_URL = `${SUPABASE_URL}/functions/v1/bright-handler`;

const SESSION_KEY = "private_universe_session";

const messagesBox = document.getElementById("messages");
const input = document.getElementById("messageInput");
const form = document.getElementById("messageForm");
const sendButton = document.getElementById("sendButton");
const statusText = document.getElementById("status");

let currentPerson = null;
let lastMessageId = null;
let isSending = false;
let isLoading = false;
let refreshTimer = null;
let hasLoadedMessages = false;


// STATUS

function setStatus(message) {
  statusText.textContent = message;
}


// EMPTY / ERROR DISPLAY

function showPlaceholder(message) {
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


// API REQUEST

async function api(action, extra = {}) {

  const token = localStorage.getItem(SESSION_KEY);

  if (!token) {
    throw new Error("Login session missing. Please log in again.");
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
      "Invalid response from the server."
    );

  }

  if (response.status === 401) {

    localStorage.removeItem("private_universe_session");
    localStorage.removeItem("private_universe_person");
    localStorage.removeItem("private_universe_expiry");

    location.replace("Login.html");

    throw new Error("Session expired. Please log in again.");

  }

  if (!response.ok) {

    throw new Error(
      data.error || `Server error (${response.status}).`
    );

  }

  return data;
}


// MESSAGE TIME

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


// CREATE MESSAGE

function createMessage(message) {

  const mine = message.sender === currentPerson;

  const row = document.createElement("div");

  row.className = "message-row" + (
    mine ? " mine" : ""
  );

  const sender = document.createElement("div");

  sender.className = "sender";

  sender.textContent = mine
    ? "You"
    : "Jaidaa";

  const bubble = document.createElement("div");

  bubble.className = "bubble";

  bubble.textContent = message.body;

  const time = document.createElement("div");

  time.className = "time";

  time.textContent = formatTime(message.created_at);

  row.append(sender, bubble, time);

  return row;

}


// LOAD MESSAGES

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

    const fragment = document.createDocumentFragment();

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

        fragment.appendChild(
          createMessage(message)
        );

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


// SEND MESSAGE

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
        result.error || "The server did not confirm your message."
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


// AUTO RESIZE

input.addEventListener("input", () => {

  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 120) + "px";

});


// ENTER TO SEND

input.addEventListener("keydown", event => {

  if (
    event.key === "Enter" &&
    !event.shiftKey
  ) {

    event.preventDefault();

    form.requestSubmit();

  }

});


// FORM EVENT

form.addEventListener("submit", sendMessage);


// START CHAT

async function startChat() {

  try {

    setStatus("Checking your session...");

    showPlaceholder("Connecting to your private universe...");

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
      "private_universe_person",
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


// START

startChat();
