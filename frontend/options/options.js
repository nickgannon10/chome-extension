document.addEventListener("DOMContentLoaded", function () {
  // Fetch the elements
  const apiKeyInput = document.getElementById("apiKey");
  const saveButton = document.getElementById("save-button");
  const deleteButton = document.getElementById("delete-button");
  const statusMessage = document.getElementById("status-message");

  // Retrieve the saved API key from local storage
  chrome.storage.local.get(["apiKey"], function (result) {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
  });

  // Add event listener to the save button
  saveButton.addEventListener("click", function () {
    // Get the entered API key
    const apiKey = apiKeyInput.value.trim();

    // Check if the API key is not empty
    if (
      apiKey !== "" &&
      apiKey.length > 10 &&
      apiKey.length < 100 &&
      apiKey.includes("sk-")
    ) {
      // Save the API key to local storage
      chrome.storage.local.set({ apiKey }, function () {
        // Update the status message
        statusMessage.textContent = "API key saved successfully!";
        setTimeout(function () {
          // Clear the status message after 2 seconds
          statusMessage.textContent = "";
        }, 2000);
      });
    } else {
      // Display an error message if the API key is empty
      statusMessage.textContent = "Please enter a valid API key.";
    }
  });

  // Add event listener to the delete button
  deleteButton.addEventListener("click", function () {
    // Remove the API key from local storage
    chrome.storage.local.remove(["apiKey"], function () {
      // Update the status message
      statusMessage.textContent = "API key deleted successfully!";
      apiKeyInput.value = "";
      setTimeout(function () {
        // Clear the status message after 2 seconds
        statusMessage.textContent = "";
      }, 2000);
    });
  });

  // Set hardcoded text for elements
  document.getElementById("optionsTitle").innerHTML = "Options";
  document.getElementById("apiTitle").innerHTML = "API Key";
  document.getElementById("apiKey").placeholder = "Enter your API key";
  document.getElementById("api-key-note").innerHTML =
    "Your API key is stored locally and is only used to authenticate requests to the API.";
  document.getElementById("save-button-text").innerText = "Save";
  document.getElementById("delete-button-text").innerText = "Delete";
});
