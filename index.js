require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { AzureOpenAI } = require("openai");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const app = express();
app.use(express.json());
app.use(cors());

// Configure multer to use memory storage (file available as a buffer)
const upload = multer({ storage: multer.memoryStorage() });

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: "2024-05-01-preview",
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;
  let thread;

  try {
    if (threadId) {
      thread = { id: threadId };
    } else {
      thread = await client.beta.threads.create();
    }

    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message,
    });

    let run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });
    let runStatus = run.status;

    while (runStatus === "queued" || runStatus === "in_progress") {
      await new Promise((r) => setTimeout(r, 1000));
      const statusCheck = await client.beta.threads.runs.retrieve(thread.id, run.id);
      runStatus = statusCheck.status;

      if (statusCheck.required_action?.type === "submit_tool_outputs") {
        const toolCalls = statusCheck.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = toolCalls.map((call) => {
          if (call.function.name === "get_this_weeks_assignments") {
            return {
              tool_call_id: call.id,
              output: JSON.stringify([
                { title: "ENGR Homework 4", due: "2025-04-10T23:59:00" },
                { title: "MA 221 Quiz", due: "2025-04-12T09:00:00" },
              ]),
            };
          }
          return {
            tool_call_id: call.id,
            output: "Not implemented yet.",
          };
        });
        await client.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
          tool_outputs: toolOutputs,
        });

        runStatus = "in_progress";
        while (runStatus === "queued" || runStatus === "in_progress") {
          await new Promise((r) => setTimeout(r, 1000));
          const runCheck = await client.beta.threads.runs.retrieve(thread.id, run.id);
          runStatus = runCheck.status;
        }
      }
    }

    const messagesData = await client.beta.threads.messages.list(thread.id);
    const lastAssistantMessage = messagesData.data.find((msg) => msg.role === "assistant");

    res.json({
      response:
        lastAssistantMessage?.content?.[0]?.text?.value || "Still no reply 😕",
      threadId: thread.id,
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ response: "Something went wrong. 😕" });
  }
});

// NEW /upload endpoint for PDF uploads
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      console.error("No file received.");
      return res.status(400).json({
        status: "error",
        message: "No file uploaded.",
      });
    }
    if (req.file.mimetype !== "application/pdf") {
      console.error("Invalid file type:", req.file.mimetype);
      return res.status(400).json({
        status: "error",
        message: "Only PDF files are accepted.",
      });
    }
    
    const pdfData = await pdfParse(req.file.buffer);
    console.log("PDF text extracted:", pdfData.text.substring(0, 100)); // Log first 100 characters
    
    // Extract events using a custom function; adjust extraction logic as needed
    const extractedEvents = extractEventsFromPDF(pdfData.text);
    
    res.json({
      status: "success",
      message: `I found ${extractedEvents.length} events in the uploaded PDF.`,
      events: extractedEvents,
    });
  } catch (err) {
    console.error("PDF processing error:", err);
    res.status(500).json({ status: "error", message: "Failed to process the PDF." });
  }
});

// Example extraction function: update as needed to parse your syllabus format.
function extractEventsFromPDF(text) {
  const events = [];
  const lines = text.split("\n");
  lines.forEach((line) => {
    if (line.toLowerCase().includes("exam") || line.toLowerCase().includes("assignment")) {
      events.push({
        title: line.trim(),
        start: "2025-04-01T09:00:00",  // Placeholder values; replace with actual logic
        end: "2025-04-01T11:00:00",
      });
    }
  });
  return events;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
