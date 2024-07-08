let isSpaceActive = false;
let mediaRecorder;
let audioChunks = [];
let port;
let reconnectAttempts = 0;
let isExtensionContextValid = true;
let checkExtensionContextInterval;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
let webmHeader = null;

const spaceSelectors = [
  "#SpaceDockExpanded",
  "#space-gradient",
  '[data-testid="SpaceDockExpanded"]',
  ".live",
  ".space",
];

console.log("Content script loaded and running");

function connectToExtension() {
  if (!isExtensionContextValid) {
    console.log("Extension context is invalid. Not attempting to connect.");
    return false;
  }

  try {
    port = chrome.runtime.connect({ name: "contentScript" });
    port.onDisconnect.addListener(handleDisconnect);
    port.onMessage.addListener(handleMessage);
    reconnectAttempts = 0;
    console.log("Connected to extension");
    return true;
  } catch (error) {
    console.error("Failed to connect to extension:", error);
    if (error.message.includes("Extension context invalidated")) {
      handleInvalidExtensionContext();
    } else {
      handleDisconnect();
    }
    return false;
  }
}

function handleInvalidExtensionContext() {
  console.log("Extension context invalidated. Stopping reconnection attempts.");
  isExtensionContextValid = false;
  clearInterval(checkExtensionContextInterval);
  checkExtensionContextInterval = setInterval(checkExtensionContext, 60000); // Check every minute
}

function checkExtensionContext() {
  if (chrome.runtime && chrome.runtime.id) {
    console.log("Extension context is valid again. Attempting to reconnect.");
    isExtensionContextValid = true;
    clearInterval(checkExtensionContextInterval);
    connectToExtension();
  }
}

function handleDisconnect() {
  console.log("Port disconnected");
  port = null;
  if (isExtensionContextValid) {
    reconnectToExtension();
  }
}

function reconnectToExtension() {
  if (!isExtensionContextValid) {
    console.log("Extension context is invalid. Not attempting to reconnect.");
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("Max reconnection attempts reached. Giving up.");
    return;
  }

  const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);

  setTimeout(() => {
    if (connectToExtension()) {
      console.log("Reconnected successfully");
    } else {
      reconnectAttempts++;
      reconnectToExtension();
    }
  }, delay);
}

function sendMessage(message) {
  if (!isExtensionContextValid) {
    console.log("Extension context is invalid. Message not sent:", message);
    return;
  }

  if (!port) {
    console.warn("Port not connected. Attempting to reconnect.");
    connectToExtension();
    // Queue the message to be sent after reconnection
    setTimeout(() => sendMessage(message), 100);
    return;
  }

  try {
    port.postMessage(message);
  } catch (error) {
    console.error("Error sending message:", error);
    handleDisconnect();
  }
}

function checkForActiveSpace() {
  console.log("Checking for active space");

  for (let selector of spaceSelectors) {
    const spaceElement = document.querySelector(selector);
    if (spaceElement) {
      if (!isSpaceActive) {
        isSpaceActive = true;

        sendMessage({ action: "spaceDetected", selector: selector });
      }
      return;
    }
  }

  if (isSpaceActive) {
    isSpaceActive = false;
    console.log("Space ended");
    sendMessage({ action: "spaceEnded" });
  }
}

const observer = new MutationObserver(() => {
  checkForActiveSpace();
});
observer.observe(document.body, { childList: true, subtree: true });

checkForActiveSpace();

function handleMessage(message) {
  console.log("Message received in content script:", message);

  if (message.action === "startRecording" && isSpaceActive) {
    startRecording();
  } else if (message.action === "stopRecording") {
    stopRecording();
  }
}

function extractHeaderFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = function () {
      const arrayBuffer = reader.result;
      const headerSize = findHeaderSize(arrayBuffer);
      const header = arrayBuffer.slice(0, headerSize);
      resolve(header);
    };
    reader.readAsArrayBuffer(blob);
  });
}

function findHeaderSize(arrayBuffer) {
  return 1000;
}

function sendChunkToBackend(chunk) {
  const reader = new FileReader();
  reader.onloadend = async function () {
    const arrayBuffer = reader.result;
    let chunkWithHeader = arrayBuffer;

    if (webmHeader) {
      // Prepend the header to the chunk
      chunkWithHeader = new Uint8Array(
        webmHeader.byteLength + arrayBuffer.byteLength
      );
      chunkWithHeader.set(new Uint8Array(webmHeader), 0);
      chunkWithHeader.set(new Uint8Array(arrayBuffer), webmHeader.byteLength);
    }

    const binaryString = arrayBufferToBinaryString(chunkWithHeader.buffer);
    const base64Data = btoa(binaryString);
    console.log("Chunk size:", chunk.size);
    console.log("Chunk base64 data length:", base64Data.length);
    console.log("Chunk base64 data:", base64Data.slice(0, 100)); // Log first 100 characters for inspection
    await sendMessageToBackend(base64Data, chunk.size);
  };
  reader.readAsArrayBuffer(chunk);
}

function arrayBufferToBinaryString(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

async function sendMessageToBackend(base64Data, size) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "saveChunk",
        audioData: base64Data,
        mimeType: "audio/webm",
        size: size,
      },
      (response) => {
        if (response.error) {
          console.error("Error uploading chunk:", response.error);
          reject(response.error);
        } else {
          console.log("Chunk uploaded successfully");
          resolve();
        }
      }
    );
  });
}

function startRecording() {
  console.log("Starting recording");

  navigator.mediaDevices
    .getDisplayMedia({ video: true, audio: true })
    .then(async (stream) => {
      mediaRecorder = new MediaRecorder(stream);
      const CHUNK_DURATION = 60000;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          if (!webmHeader) {
            // Extract header from the first chunk
            webmHeader = await extractHeaderFromBlob(event.data);
          }

          audioChunks.push(event.data);
          if (mediaRecorder.state === "recording") {
            sendChunkToBackend(event.data);
          }
        }
      };

      mediaRecorder.onstop = saveRemainingChunks;

      mediaRecorder.start();
      sendMessage({ action: "recordingStarted" });

      setInterval(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.requestData();
        }
      }, CHUNK_DURATION);
    })
    .catch((error) => {
      console.error("Error starting recording:", error);
      sendMessage({ action: "recordingError", error: error.message });
    });
}

function stopRecording() {
  console.log("Stopping recording");

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    sendMessage({ action: "recordingStopped" });
  }
}

function saveRemainingChunks() {
  if (audioChunks.length > 0) {
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const reader = new FileReader();

    reader.onloadend = async function (event) {
      const arrayBuffer = event.target.result;
      const binaryString = arrayBufferToBinaryString(arrayBuffer);
      const base64Data = btoa(binaryString);
      console.log("Final recording base64 data:", base64Data.slice(0, 100)); // Log first 100 characters for inspection

      // Wait if an upload is in progress
      while (isUploading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      isUploading = true;
      await sendMessageToBackend(base64Data, blob.size);
      isUploading = false;

      audioChunks = [];
    };

    reader.readAsArrayBuffer(blob);
  }
}

function arrayBufferToBinaryString(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Content script received message:", message);
  handleMessage(message);
});

connectToExtension();
