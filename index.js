const BACKEND_URL = "https://calendar-copilot-backend-sankalpkhira-c2dcbcfvf3gdcrad.eastus2-01.azurewebsites.net";

// Global variable to store the conversation thread id
let currentThreadId = null;

export function toggleCopilot() {
  const el = document.getElementById("copilot-container");
  el.classList.toggle("hidden");
}

export async function sendToCopilot() {
  const input = document.getElementById("copilot-input");
  const text = input.value.trim();
  if (!text) return;

  const messages = document.getElementById("copilot-messages");
  messages.innerHTML += `<div class="user">🧑‍💻 ${text}</div>`;
  input.value = "";

  try {
    // Include the currentThreadId in the request to persist the conversation thread
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, threadId: currentThreadId })
    });

    const data = await res.json();

    // Update the thread id if returned from the backend
    if (data.threadId) {
      currentThreadId = data.threadId;
    }

    if (data.response) {
      messages.innerHTML += `<div class="assistant">🤖 ${data.response}</div>`;
    } else {
      messages.innerHTML += `<div class="assistant error">🤖 No response received.</div>`;
    }

    if (data.events) {
      // Dispatch the events extracted from the PDF (if any)
      document.dispatchEvent(new CustomEvent("copilot-events", { detail: data.events }));
    }
  } catch (err) {
    messages.innerHTML += `<div class="assistant error">❌ Error: ${err.message}</div>`;
    console.error("Error sending chat message:", err);
  }

  messages.scrollTop = messages.scrollHeight;
}

export async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const messages = document.getElementById("copilot-messages");

  messages.innerHTML += `<div class="user">🧑‍💻 Uploaded file: ${file.name}</div>`;
  
  if (file.type !== "application/pdf") {
    messages.innerHTML += `<div class="assistant error">🤖 Please upload a valid PDF file.</div>`;
    return;
  }
  
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch(`${BACKEND_URL}/upload`, {
      method: "POST",
      body: formData
    });
    
    // For debugging: log raw response text
    const rawResponse = await res.text();
    console.log("Raw upload response:", rawResponse);
    
    let data;
    try {
      data = JSON.parse(rawResponse);
    } catch (e) {
      throw new Error("Backend did not return valid JSON.");
    }
    
    // Check for data.message and display it
    if (data.message) {
      messages.innerHTML += `<div class="assistant">🤖 ${data.message}</div>`;
    } else {
      messages.innerHTML += `<div class="assistant error">🤖 No response received for PDF upload.</div>`;
    }
    
    // Dispatch custom event with the extracted events (optional)
    if (data.events) {
      document.dispatchEvent(new CustomEvent("copilot-events", { detail: data.events }));
    }
  } catch (err) {
    messages.innerHTML += `<div class="assistant error">❌ Error: ${err.message}</div>`;
    console.error("Error during PDF upload:", err);
  }
  
  messages.scrollTop = messages.scrollHeight;
}
