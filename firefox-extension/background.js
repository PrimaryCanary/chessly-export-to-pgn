"use strict";

const STUDY_PATH = /^\/courses\/[^/]+\/chapters\/[^/]+\/studies\/([^/]+)\/lines\/?$/;
const LICHESS_CLIENT_ID = "chessly-pgn-exporter@local";
const LICHESS_SCOPE = "study:write";
const LICHESS_AUTH_KEY = "lichessAuth";
let lastLichessUpload = { studyId: "", orientation: "" };

function studyIdFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new Error("Could not read the current tab URL.");
  }

  if (parsed.hostname !== "chessly.com") {
    throw new Error("Open a Chessly study's Lines page first.");
  }
  const match = parsed.pathname.match(STUDY_PATH);
  if (!match) {
    throw new Error("Open a Chessly study's Lines page first.");
  }
  return match[1];
}

function lichessStudyId(value) {
  const input = value.trim();
  if (/^[A-Za-z0-9]{8}$/.test(input)) return input;
  try {
    const parsed = new URL(input);
    const match = parsed.hostname === "lichess.org" && parsed.pathname.match(/^\/study\/([A-Za-z0-9]{8})(?:\/|$)/);
    if (match) return match[1];
  } catch (_) {
    // Fall through to the actionable validation error below.
  }
  throw new Error("Enter a Lichess study URL or its 8-character ID.");
}

async function fetchJson(url, label) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not fetch ${label} (${response.status} ${response.statusText}).`);
  }
  return response.json();
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomValue() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function pkceChallenge(verifier) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(hash));
}

async function lichessAuth() {
  const { [LICHESS_AUTH_KEY]: auth } = await browser.storage.local.get(LICHESS_AUTH_KEY);
  if (!auth || auth.expiresAt <= Date.now()) {
    if (auth) await browser.storage.local.remove(LICHESS_AUTH_KEY);
    throw new Error("Connect to Lichess before uploading.");
  }
  return auth;
}

async function connectLichess() {
  const redirectUri = browser.identity.getRedirectURL("lichess-oauth");
  const verifier = randomValue();
  const state = randomValue();
  const authorizationUrl = new URL("https://lichess.org/oauth");
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: await pkceChallenge(verifier),
    scope: LICHESS_SCOPE,
    state,
  });

  const callbackUrl = await browser.identity.launchWebAuthFlow({
    url: authorizationUrl.href,
    interactive: true,
  });
  const callback = new URL(callbackUrl);
  if (callback.searchParams.get("state") !== state) throw new Error("Lichess sign-in returned an invalid state.");
  if (callback.searchParams.has("error")) {
    throw new Error(callback.searchParams.get("error_description") || "Lichess sign-in was cancelled.");
  }
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("Lichess sign-in returned no authorization code.");

  const response = await fetch("https://lichess.org/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: LICHESS_CLIENT_ID,
    }),
  });
  if (!response.ok) throw new Error(`Lichess sign-in failed while exchanging the authorization code (${response.status}).`);
  const token = await response.json();
  const accountResponse = await fetch("https://lichess.org/api/account", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!accountResponse.ok) throw new Error("Lichess sign-in could not verify your account.");
  const account = await accountResponse.json();
  const auth = {
    accessToken: token.access_token,
    username: account.username || account.id,
    expiresAt: Date.now() + Number(token.expires_in || 0) * 1000,
  };
  await browser.storage.local.set({ [LICHESS_AUTH_KEY]: auth });
  return { username: auth.username };
}

async function disconnectLichess() {
  const { [LICHESS_AUTH_KEY]: auth } = await browser.storage.local.get(LICHESS_AUTH_KEY);
  try {
    if (auth && auth.accessToken) {
      await fetch("https://lichess.org/api/token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
    }
  } finally {
    await browser.storage.local.remove(LICHESS_AUTH_KEY);
  }
}

function positionInfo(fen) {
  const [, turn, , , , moveNumber] = fen.split(" ");
  return { turn, moveNumber: Number(moveNumber) };
}

function escapeComment(text) {
  return text.replaceAll("}", "]").trim();
}

function mergePgn(movesByFen, commentsByFen) {
  function commentAfter(fen) {
    const entries = commentsByFen[fen] || [];
    const text = entries.map(({ text }) => text && text.trim()).filter(Boolean).join("\n\n");
    return text ? ` { ${escapeComment(text)} }` : "";
  }

  function children(fen) {
    const byMove = new Map();
    for (const move of movesByFen[fen] || []) {
      const key = `${move.san}\u0000${move.nextFen}`;
      const child = byMove.get(key) || { ...move };
      if (move.variationIndex < child.variationIndex) child.variationIndex = move.variationIndex;
      byMove.set(key, child);
    }
    return [...byMove.values()].sort((a, b) =>
      a.variationIndex - b.variationIndex || a.san.localeCompare(b.san),
    );
  }

  function renderMove(move) {
    const { turn, moveNumber } = positionInfo(move.fen);
    const prefix = turn === "w" ? `${moveNumber}.` : `${moveNumber}...`;
    return `${prefix} ${move.san}${commentAfter(move.nextFen)}`;
  }

  function renderFollowing(fen, ancestry) {
    const nextMoves = children(fen);
    if (!nextMoves.length) return [];
    const [main, ...variations] = nextMoves;
    if (ancestry.has(main.fen)) throw new Error(`Cycle detected at ${main.fen}`);
    const nextAncestry = new Set(ancestry).add(main.fen);
    return [
      renderMove(main),
      ...variations.map((variation) => `(${renderLine(variation, ancestry)})`),
      ...renderFollowing(main.nextFen, nextAncestry),
    ];
  }

  function renderLine(move, ancestry = new Set()) {
    if (ancestry.has(move.fen)) throw new Error(`Cycle detected at ${move.fen}`);
    const visited = new Set(ancestry).add(move.fen);
    return [renderMove(move), ...renderFollowing(move.nextFen, visited)].join(" ");
  }

  const rootFen = Object.keys(movesByFen).find((fen) => {
    const { turn, moveNumber } = positionInfo(fen);
    return turn === "w" && moveNumber === 1 && fen.startsWith("rnbqkbnr/");
  });
  if (!rootFen) throw new Error("Could not find the initial chess position.");
  const rootMoves = children(rootFen);
  if (!rootMoves.length) throw new Error("The initial position has no moves.");

  const [main, ...variations] = rootMoves;
  const movetext = [renderLine(main), ...variations.map((move) => `(${renderLine(move)})`), "*"]
    .join(" ");
  const headers = {
    Event: "Chessly PGN Export",
    Site: "https://chessly.com",
    Date: new Date().toISOString().slice(0, 10).replaceAll("-", "."),
    Round: "1",
    White: "Player1",
    Black: "Player2",
    Result: "*",
  };
  const headerText = Object.entries(headers).map(([name, value]) => `[${name} "${value}"]`).join("\n");
  return `${headerText}\n\n${movetext}\n`;
}

async function currentStudyPgn() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const studyId = studyIdFromUrl(tabs[0] && tabs[0].url);
  const endpoint = `https://cag.chessly.com/beta/openings/courses/studies/${studyId}`;
  const [moves, comments] = await Promise.all([
    fetchJson(`${endpoint}/moves`, "moves"),
    fetchJson(`${endpoint}/comments`, "comments"),
  ]);
  return { pgn: mergePgn(moves, comments), positions: Object.keys(moves).length };
}

async function uploadToLichess({ study, chapterName, orientation }) {
  const studyId = lichessStudyId(study || "");
  const name = (chapterName || "").trim();
  if (!name || name.length > 100) throw new Error("Chapter name must be between 1 and 100 characters.");
  if (orientation && !["white", "black"].includes(orientation)) {
    throw new Error("Board orientation must be White or Black.");
  }
  const auth = await lichessAuth();

  const { pgn, positions } = await currentStudyPgn();
  const body = new URLSearchParams({ pgn, name });
  if (orientation) body.set("orientation", orientation);
  const response = await fetch(`https://lichess.org/api/study/${studyId}/import-pgn`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const error = await response.json();
      detail = error.error || error.message || "";
    } catch (_) {
      detail = await response.text();
    }
    throw new Error(`Lichess upload failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  lastLichessUpload = { studyId, orientation: orientation || "" };
  return { positions, studyId };
}

browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "export-study") {
    const { pgn, positions } = await currentStudyPgn();
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const studyId = studyIdFromUrl(tabs[0] && tabs[0].url);
    const blobUrl = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    try {
      await browser.downloads.download({
        url: blobUrl,
        filename: `chessly-${studyId}.pgn`,
        saveAs: true,
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
    return { positions };
  }
  if (message.action === "upload-to-lichess") return uploadToLichess(message);
  if (message.action === "connect-lichess") return connectLichess();
  if (message.action === "disconnect-lichess") return disconnectLichess();
  if (message.action === "lichess-auth-status") {
    try {
      const auth = await lichessAuth();
      return { connected: true, username: auth.username };
    } catch (_) {
      return { connected: false };
    }
  }
  if (message.action === "lichess-upload-defaults") return lastLichessUpload;
  if (message.action === "set-lichess-upload-defaults") {
    lastLichessUpload = {
      studyId: typeof message.studyId === "string" ? message.studyId : lastLichessUpload.studyId,
      orientation: ["", "white", "black"].includes(message.orientation)
        ? message.orientation
        : lastLichessUpload.orientation,
    };
    return undefined;
  }
  return undefined;
});
