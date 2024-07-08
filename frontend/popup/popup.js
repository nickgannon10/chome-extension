document.addEventListener("DOMContentLoaded", function () {
  console.log("Popup loaded");
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  let XSpaceRecordBtn = document.getElementById("record-space-btn");
  let isRecording = false;

  if (XSpaceRecordBtn) {
    XSpaceRecordBtn.disabled = false;
  }

  const port = chrome.runtime.connect({ name: "popup" });

  port.onMessage.addListener(function (message) {
    console.log("Popup received message:", message);
    switch (message.action) {
      case "spaceDetected":
        handleSpaceDetected();
        break;
      case "spaceEnded":
        handleSpaceEnded();
        break;
      case "recordingStarted":
        handleRecordingStarted();
        break;
      case "recordingStopped":
        handleRecordingStopped();
        break;
      case "recordingSaved":
        handleRecordingSaved();
        break;
      case "recordingError":
        handleRecordingError(message.error);
        break;
      default:
        handleDefaultMessage(message);
    }

    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>';
    userInput.disabled = false;
  });

  // If the user has not entered an API key, open the options page
  chrome.storage.local.get("apiKey", ({ apiKey }) => {
    if (!apiKey || apiKey.length < 10) {
      chrome.runtime.openOptionsPage();
    }
  });

  // Fetch chat history from local storage and display it
  chrome.storage.local.get(["chatHistory"], function (result) {
    const chatHistory = result.chatHistory || [];

    if (chatHistory.length > 0) {
      displayMessages(chatHistory);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      displayAssistantInfo();
    }

    checkClearChatBtn();
  });

  userInput.focus();
  sendBtn.disabled = true;

  userInput.addEventListener("keyup", function () {
    sendBtn.disabled = userInput.value.trim() === "";
  });

  userInput.addEventListener("keyup", function (event) {
    if (event.code === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendBtn.click();
    }
  });

  userInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
    this.style.overflowY = this.scrollHeight > 100 ? "scroll" : "auto";
  });

  sendBtn.addEventListener("click", function () {
    const userMessage = userInput.value.trim();
    if (userMessage !== "") {
      sendMessage(userMessage);
      userInput.value = "";
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i class="fa fa-spinner fa-pulse"></i>';
      userInput.disabled = true;
      userInput.style.height = "auto";
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  chrome.runtime.onMessage.addListener(function (
    message,
    sender,
    sendResponse
  ) {
    console.log("Popup received message:", message);
    switch (message.action) {
      case "spaceDetected":
        handleSpaceDetected();
        break;
      case "spaceEnded":
        handleSpaceEnded();
        break;
      case "recordingStarted":
        handleRecordingStarted();
        break;
      case "recordingStopped":
        handleRecordingStopped();
        break;
      case "recordingSaved":
        handleRecordingSaved();
        break;
      case "recordingError":
        handleRecordingError(message.error);
        break;
      default:
        handleDefaultMessage(message);
    }

    sendBtn.disabled = false;
    sendBtn.innerHTML = '<i class="fa fa-paper-plane"></i>';
    userInput.disabled = false;
  });

  function handleSpaceDetected() {
    console.log("Handling space detected in popup");
    XSpaceRecordBtn.disabled = false;
    XSpaceRecordBtn.title = "Record Twitter Space";
    displayStatusMessage(
      "Twitter Space detected. You can now start recording."
    );

    const liveIndicator = document.createElement("div");
    liveIndicator.id = "live-indicator";
    liveIndicator.textContent = "LIVE";
    liveIndicator.style.color = "red";
    liveIndicator.style.fontWeight = "bold";
    document.body.insertBefore(liveIndicator, document.body.firstChild);
  }

  function handleSpaceEnded() {
    console.log("Handling space ended in popup");
    XSpaceRecordBtn.disabled = true;
    XSpaceRecordBtn.innerHTML = '<i class="fa fa-microphone"></i>';
    XSpaceRecordBtn.title = "No active Twitter Space";
    isRecording = false;
    displayStatusMessage("Twitter Space has ended.");
    const liveIndicator = document.getElementById("live-indicator");
    if (liveIndicator) {
      liveIndicator.remove();
    }
  }

  function handleRecordingStarted() {
    console.log("Handling recording started in popup");
    isRecording = true;
    XSpaceRecordBtn.innerHTML = '<i class="fa fa-stop"></i>';
    XSpaceRecordBtn.title = "Stop Recording";
    displayStatusMessage("Recording started...");

    // Update the badge to show "RECORDING"
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  }

  function handleRecordingStopped() {
    console.log("Handling recording stopped in popup");
    isRecording = false;
    XSpaceRecordBtn.innerHTML = '<i class="fa fa-microphone"></i>';
    XSpaceRecordBtn.title = "Record Twitter Space";
    displayStatusMessage("Recording stopped. Saving...");
    chrome.action.setBadgeText({ text: "" });
  }

  function handleRecordingSaved() {
    console.log("Handling recording saved in popup");
    displayStatusMessage("Recording saved successfully!");
  }

  function handleRecordingError(error) {
    console.log("Handling recording error in popup:", error);
    displayStatusMessage("Error: " + error, "error");
  }

  function handleDefaultMessage(message) {
    console.log("Handling default message in popup:", message);
    if (message.answer || message.imageUrl) {
      displayMessage("assistant", message.answer || message.imageUrl);
    } else if (message.error) {
      displayMessage("system", message.error);
    }
  }

  function sendMessage(userMessage) {
    console.log(
      "Sending user message to backend for additional content:",
      userMessage
    );

    fetch("http://localhost:8000/query_vectors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: userMessage }),
    })
      .then((response) => response.json())
      .then((data) => {
        const additionalContent = data.result;
        console.log(
          "Received additional content from backend:",
          additionalContent
        );

        const combinedMessage = `${additionalContent} ${userMessage}`;
        console.log("Combined message to be sent:", combinedMessage);

        // Send the combined message to the background script
        chrome.runtime.sendMessage(
          { action: "userInput", userInput: combinedMessage },
          function (response) {
            console.log("Response from background script:", response);
          }
        );

        if (document.getElementById("assistant-info-wrapper")) {
          hideAssistantInfo();
        }
        displayMessage("user", userMessage);
      })
      .catch((error) => {
        console.error("Error fetching additional content:", error);
        displayMessage("system", "Error fetching additional content.");
      });
  }

  function displayMessage(role, content) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", role);

    if (
      content.startsWith("https://oaidalleapiprodscus.blob.core.windows.net/")
    ) {
      displayImageMessage(messageElement, content, role);
    } else {
      displayTextMessage(messageElement, content, role);
    }

    chatMessages.appendChild(messageElement);
    checkClearChatBtn();
    messageElement.scrollIntoView();
  }

  function displayImageMessage(messageElement, content, role) {
    const imageElement = document.createElement("img");
    imageElement.src = content;
    messageElement.appendChild(imageElement);

    if (role === "assistant") {
      addDownloadButton(messageElement, content);
    }
  }

  function displayTextMessage(messageElement, content, role) {
    messageElement.innerHTML = formatMessageContent(content);

    if (role === "assistant") {
      addCopyButton(messageElement, content);
    }
  }

  function addDownloadButton(messageElement, content) {
    const actionBtns = document.createElement("div");
    actionBtns.className = "action-btns";
    messageElement.appendChild(actionBtns);

    const downloadIcon = document.createElement("i");
    downloadIcon.className = "fa fa-download download-btn";
    downloadIcon.title = "Download image";
    downloadIcon.addEventListener("click", () =>
      downloadImage(content, downloadIcon)
    );

    actionBtns.appendChild(downloadIcon);
  }

  function addCopyButton(messageElement, content) {
    const actionBtns = document.createElement("div");
    actionBtns.className = "action-btns";
    messageElement.appendChild(actionBtns);

    const copyIcon = document.createElement("i");
    copyIcon.className = "fa fa-copy action-btn";
    copyIcon.title = "Copy to clipboard";
    copyIcon.addEventListener("click", () =>
      copyToClipboard(content, copyIcon)
    );

    actionBtns.appendChild(copyIcon);
  }

  function downloadImage(url, icon) {
    chrome.downloads
      .download({
        url: url,
        filename: "dall-e-image.png",
        saveAs: false,
      })
      .then(() => updateIcon(icon, "fa-check"))
      .catch(() => updateIcon(icon, "fa-times"));
  }

  function copyToClipboard(text, icon) {
    navigator.clipboard
      .writeText(text)
      .then(() => updateIcon(icon, "fa-check"))
      .catch(() => updateIcon(icon, "fa-times"));
  }

  function updateIcon(icon, newClass) {
    icon.className = `fa ${newClass} action-btn`;
    setTimeout(() => {
      icon.className = "fa fa-copy action-btn";
    }, 2000);
  }

  function formatMessageContent(text) {
    return text.replace(
      /```(\w+)?([\s\S]*?)```/g,
      function (match, lang, code) {
        code = code.replace(/^\n/, "");
        return `<div class="code-block"><code>${code}</code></div>`;
      }
    );
  }

  function displayMessages(messages) {
    for (const message of messages) {
      if (message.role !== "system") {
        displayMessage(message.role, message.content);
      }
    }
  }

  function checkClearChatBtn() {
    chrome.storage.local.get(["chatHistory"], function (result) {
      clearChatBtn.disabled = !(
        result.chatHistory && result.chatHistory.length > 0
      );
    });
  }

  clearChatBtn.addEventListener("click", function () {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      chrome.storage.local.set({ chatHistory: [] }, function () {
        console.log("Chat history cleared");
        chatMessages.innerHTML = "";
        sendBtn.disabled = true;
        checkClearChatBtn();
        displayAssistantInfo();
      });
    }
  });

  XSpaceRecordBtn.addEventListener("click", function () {
    console.log("Record button clicked"); // Log click event
    const action = isRecording ? "stopRecording" : "startRecording";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error("No active tab found.");
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url;
      console.log("Active tab:", tabId, tabUrl); // Log active tab details
      chrome.tabs.sendMessage(tabId, { action: action }, function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending message:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Message sent to content script:", response);
        }
      });
    });
  });

  document
    .getElementById("settings-btn")
    .addEventListener("click", function () {
      chrome.runtime.openOptionsPage();
    });

  const modelDropdownBtn = document.getElementById("model-dropdown-btn");
  const modelDropdownContent = document.getElementById(
    "model-dropdown-content"
  );

  modelDropdownBtn.addEventListener("click", function () {
    modelDropdownContent.style.display =
      modelDropdownContent.style.display === "flex" ? "none" : "flex";
    modelDropdownBtn.classList.toggle(
      "active",
      modelDropdownContent.style.display === "flex"
    );
  });

  window.addEventListener("click", function (event) {
    if (!event.target.matches("#model-dropdown-btn")) {
      modelDropdownContent.style.display = "none";
      modelDropdownBtn.classList.remove("active");
    }
  });

  const dropdownLinks = document.querySelectorAll(".model-dropdown-btn");
  dropdownLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      chrome.storage.local.set({ apiModel: link.id });
      document.getElementById("model-dropdown-btn-text").innerText =
        link.innerText;
      setActiveModel(link.id);
    });
  });

  chrome.storage.local.get(["apiModel"], function (result) {
    console.log("Storage result:", result);
    if (result.apiModel) {
      const modelElement = document.getElementById(result.apiModel);
      if (modelElement) {
        document.getElementById("model-dropdown-btn-text").innerText =
          modelElement.innerText;
        setActiveModel(result.apiModel);
      } else {
        console.warn(
          `Model element with ID "${result.apiModel}" not found in the DOM. Using default model.`
        );
        const defaultModel = "gpt-4o";
        const defaultElement = document.getElementById(defaultModel);
        if (defaultElement) {
          document.getElementById("model-dropdown-btn-text").innerText =
            defaultElement.innerText;
          setActiveModel(defaultModel);
        } else {
          console.error(
            "Default model element not found. Please check your HTML structure."
          );
        }
      }
    }
  });

  function setActiveModel(model) {
    dropdownLinks.forEach((link) => link.classList.remove("active"));
    const activeLink = document.getElementById(model);
    if (activeLink) {
      activeLink.classList.add("active");
    } else {
      console.warn(`Link for model "${model}" not found.`);
    }
  }

  function displayAssistantInfo() {
    const messageElement = document.createElement("div");
    messageElement.id = "assistant-info-wrapper";

    const icon = document.createElement("img");
    icon.src = "/assets/icons/icon-128.png";
    icon.alt = "Assistant icon";
    icon.className = "assistant-info-icon";
    messageElement.appendChild(icon);

    const text = document.createElement("p");
    text.innerText = "How can I help you?";
    text.className = "assistant-info-text";
    messageElement.appendChild(text);

    chatMessages.appendChild(messageElement);
  }

  function hideAssistantInfo() {
    const assistantInfo = document.getElementById("assistant-info-wrapper");
    if (assistantInfo) {
      assistantInfo.remove();
    }
  }

  function displayStatusMessage(message, type = "info") {
    const statusElement = document.createElement("div");
    statusElement.className = `status-message ${type}`;
    statusElement.textContent = message;
    chatMessages.appendChild(statusElement);
    statusElement.scrollIntoView();

    setTimeout(() => {
      statusElement.remove();
    }, 5000);
  }
});
