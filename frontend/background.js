let chatHistory;
let popupPort = null;
let contentScriptPort = null;
const messageQueue = [];

chrome.runtime.onConnect.addListener(function (port) {
  console.log("Connected to port:", port.name);

  if (port.name === "popup") {
    popupPort = port;

    popupPort.onMessage.addListener(function (msg) {
      console.log("Background received popup message:", msg);
    });

    popupPort.onDisconnect.addListener(function () {
      console.log("Popup disconnected");
      popupPort = null;
    });

    // Process any messages that were queued while the popup was disconnected
    processMessageQueue();
  } else if (port.name === "contentScript") {
    contentScriptPort = port;

    contentScriptPort.onMessage.addListener(function (msg) {
      console.log("Background received contentScript message:", msg);
      handleContentScriptMessage(msg);
    });

    contentScriptPort.onDisconnect.addListener(function () {
      console.log("Content script disconnected");
      contentScriptPort = null;
    });
  }
});

chrome.runtime.onInstalled.addListener(function () {
  console.log("Background script installed");
  let defaultModel = "gpt-4o";
  chrome.storage.local.set({ apiModel: defaultModel, chatHistory: [] });
  chrome.runtime.openOptionsPage();
});

// chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
//   console.log("Background received message:", message);
//   handleContentScriptMessage(message);
//   return true;
// });
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  console.log("Background received message:", message);

  if (
    message.action === "startRecording" ||
    message.action === "stopRecording"
  ) {
    const tabId = message.tabId;
    chrome.tabs.sendMessage(
      tabId,
      { action: message.action },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error forwarding message to content script:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Message forwarded to content script:", response);
        }
      }
    );
  } else {
    handleContentScriptMessage(message);
  }

  return true;
});

function handleContentScriptMessage(message) {
  switch (message.action) {
    case "spaceDetected":
      handleSpaceDetected(message.selector);
      break;
    case "spaceEnded":
      handleSpaceEnded();
      break;
    case "saveRecording":
    case "saveChunk":
      handleSaveRecording(message.audioData, message.mimeType, message.size);
      break;
    case "recordingStarted":
    case "recordingStopped":
    case "recordingError":
      forwardMessageToPopup(message);
      break;
    case "userInput":
      handleUserInput(message.userInput);
      break;
  }
}

function handleSpaceDetected(selector) {
  console.log("Handling space detected in background");
  const iconPath = chrome.runtime.getURL("assets/icons/icon-48.png");
  chrome.action.setIcon({ path: iconPath });
  chrome.action.setBadgeText({ text: "LIVE" }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error setting badge:", chrome.runtime.lastError);
    } else {
      console.log("LIVE badge set successfully");
    }
  });
  console.log(`Space detected using selector: ${selector}`);
  forwardMessageToPopup({ action: "spaceDetected" });
}

function handleSpaceEnded() {
  console.log("Handling space ended in background");
  const iconPath = chrome.runtime.getURL("assets/icons/icon-48.png");
  chrome.action.setIcon({ path: iconPath });
  chrome.action.setBadgeText({ text: "" });
  console.log("Space ended");
  forwardMessageToPopup({ action: "spaceEnded" });
}

function handleSaveRecording(audioData, mimeType, size) {
  saveRecordingToBackend(audioData, mimeType, size)
    .then(() => {
      console.log("Recording saved successfully");
      forwardMessageToPopup({ action: "recordingSaved" });
    })
    .catch((error) => {
      console.error("Error saving recording:", error);
      forwardMessageToPopup({ action: "recordingError", error: error.message });
    });
}

async function saveRecordingToBackend(audioData, mimeType, size) {
  try {
    console.log("Preparing to send recording to backend...");

    // Log the payload data
    const payload = {
      audioData: audioData,
      mimeType: mimeType,
      size: size,
    };
    console.log("Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch("http://localhost:8000/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload. Status code: ${response.status}`);
    }

    console.log("Recording uploaded successfully");
    return await response.json();
  } catch (error) {
    console.error("Error uploading recording to backend:", error);
    throw error;
  }
}

function saveRecordingToFileSystem(audioUrl, mimeType) {
  return new Promise((resolve, reject) => {
    const filename = `twitter_space_${Date.now()}.webm`;
    chrome.downloads.download(
      {
        url: audioUrl,
        filename: filename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(filename);
        }
      }
    );
  });
}

function saveRecordingMetadataToDB(filePath, fileSize) {
  console.log(`Saving metadata to DB: ${filePath}, size: ${fileSize}`);
  // TODO: Implement actual database storage
  return Promise.resolve();
}

async function handleUserInput(userInput) {
  console.log("Handling user input in background script:", userInput);

  const { apiKey, apiModel } = await getStorageData(["apiKey", "apiModel"]);
  const result = await getStorageData(["chatHistory"]);

  chatHistory = result.chatHistory || [
    {
      role: "system",
      content:
        "There is a chrome extension it records text and stores it in a vector database. The text it records pertains to an Twitter (now called X refer to it as such) Space. A user will input prompts with these prompt text will be retrieved to provide additional context about the X Space that has been recorded and saved to the vector DB. The user asks questions about the Space, please provide answers. Do not provide Bolded Text in your response.",
    },
  ];

  chatHistory.push({ role: "user", content: userInput });
  console.log("Updated chat history with user input:", chatHistory);

  if (apiModel === "dall-e-3") {
    await handleImageGeneration(userInput, apiKey, apiModel);
  } else {
    await handleChatCompletion(apiKey, apiModel);
  }
}

async function handleImageGeneration(prompt, apiKey, apiModel) {
  const response = await fetchImage(prompt, apiKey, apiModel);
  if (response?.data?.[0]?.url) {
    const imageUrl = response.data[0].url;
    chatHistory.push({ role: "assistant", content: imageUrl });
    chrome.storage.local.set({ chatHistory });
    forwardMessageToPopup({ imageUrl });
  }
}

async function handleChatCompletion(apiKey, apiModel) {
  const response = await fetchChatCompletion(chatHistory, apiKey, apiModel);
  if (response?.choices?.[0]?.message?.content) {
    const assistantResponse = response.choices[0].message.content;
    chatHistory.push({ role: "assistant", content: assistantResponse });
    chrome.storage.local.set({ chatHistory });
    forwardMessageToPopup({ answer: assistantResponse });
  }
}

async function fetchChatCompletion(messages, apiKey, apiModel) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ messages, model: apiModel }),
    });

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "API key incorrect. Please check and try again."
          : `Failed to fetch. Status code: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    forwardMessageToPopup({ error: error.message });
    console.error(error);
  }
}

async function fetchImage(prompt, apiKey, apiModel) {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          model: apiModel,
          n: 1,
          size: "1024x1024",
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "API key incorrect. Please check and try again."
          : `Failed to fetch. Status code: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    forwardMessageToPopup({ error: error.message });
    console.error(error);
  }
}

function getStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });
}

function forwardMessageToPopup(message) {
  console.log("Forwarding message to popup:", message);
  if (popupPort) {
    popupPort.postMessage(message);
  } else {
    console.warn("Popup is not connected. Message not sent.");
    messageQueue.push(message);
  }
}

function processMessageQueue() {
  if (popupPort) {
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      popupPort.postMessage(message);
    }
  }
}
