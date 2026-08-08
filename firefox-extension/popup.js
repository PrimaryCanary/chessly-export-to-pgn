"use strict";

const button = document.getElementById("export");
const uploadButton = document.getElementById("upload");
const status = document.getElementById("status");
const connectButton = document.getElementById("connect");
const disconnectButton = document.getElementById("disconnect");
const lichessStatus = document.getElementById("lichess-status");
const lichessStudyInput = document.getElementById("study");
const orientationInput = document.getElementById("orientation");

function setLichessStatus(auth) {
  lichessStatus.textContent = auth.connected ? `Connected to Lichess as ${auth.username}.` : "Not connected to Lichess.";
  connectButton.hidden = auth.connected;
  disconnectButton.hidden = !auth.connected;
}

async function refreshLichessStatus() {
  setLichessStatus(await browser.runtime.sendMessage({ action: "lichess-auth-status" }));
}

async function restoreUploadDefaults() {
  const defaults = await browser.runtime.sendMessage({ action: "lichess-upload-defaults" });
  lichessStudyInput.value = defaults.studyId || "";
  orientationInput.value = ["", "white", "black"].includes(defaults.orientation)
    ? defaults.orientation
    : "";
}

function rememberUploadDefaults() {
  browser.runtime.sendMessage({
    action: "set-lichess-upload-defaults",
    studyId: lichessStudyInput.value,
    orientation: orientationInput.value,
  }).catch(() => {});
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Fetching study data…";
  try {
    const result = await browser.runtime.sendMessage({ action: "export-study" });
    status.textContent = `Downloaded PGN from ${result.positions} positions.`;
  } catch (error) {
    status.textContent = error && error.message ? error.message : "Export failed.";
  } finally {
    button.disabled = false;
  }
});

lichessStudyInput.addEventListener("input", rememberUploadDefaults);
orientationInput.addEventListener("change", rememberUploadDefaults);

uploadButton.addEventListener("click", async () => {
  uploadButton.disabled = true;
  status.textContent = "Merging and uploading PGN…";
  try {
    const result = await browser.runtime.sendMessage({
      action: "upload-to-lichess",
      study: lichessStudyInput.value,
      chapterName: document.getElementById("chapter").value,
      orientation: orientationInput.value,
    });
    lichessStudyInput.value = result.studyId;
    status.textContent = `Uploaded ${result.positions} positions to Lichess study ${result.studyId}.`;
  } catch (error) {
    status.textContent = error && error.message ? error.message : "Upload failed.";
  } finally {
    uploadButton.disabled = false;
  }
});

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  status.textContent = "Opening Lichess sign-in…";
  try {
    const auth = await browser.runtime.sendMessage({ action: "connect-lichess" });
    setLichessStatus({ connected: true, username: auth.username });
    status.textContent = "Lichess connected.";
  } catch (error) {
    status.textContent = error && error.message ? error.message : "Lichess sign-in failed.";
  } finally {
    connectButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  disconnectButton.disabled = true;
  try {
    await browser.runtime.sendMessage({ action: "disconnect-lichess" });
    setLichessStatus({ connected: false });
    status.textContent = "Lichess disconnected.";
  } catch (error) {
    status.textContent = error && error.message ? error.message : "Could not disconnect Lichess.";
  } finally {
    disconnectButton.disabled = false;
  }
});

restoreUploadDefaults().catch(() => {});
refreshLichessStatus().catch(() => setLichessStatus({ connected: false }));
