require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { AzureOpenAI } = require("openai");
const multer = require("multer");
const pdfParse = require("pdf-parse"); // Import pdf-parse

const app = express();
app.use(express.json());
app.use(cors());

// Setup multer storage (using memory storage so you get the file as a buffer)
const upload = multer({ storage: multer.memoryStorage() });

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: "2024-05-01-preview",
});

const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post("/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const thread = await client.beta.threads.create();

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

    const messages = await client.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data.find((msg) => msg.role === "assistant");

    res.json({
      response: lastMessage?.content?.[0]?.text?.value || "Still no reply 😕",
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ response: "Something went wrong. 😕" });
  }
});

// NEW: PDF Upload Endpoint
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Ensure the file was provided
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file uploaded." });
    }

    // Check file type if needed (optional)
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ status: "error", message: "Only PDF files are accepted." });
    }

    // Parse the PDF
    const pdfBuffer = req.file.buffer;
    const pdfData = await pdfParse(pdfBuffer);

    // Here, you need to extract the event details from pdfData.text.
    // For now, we'll simulate this extraction:
    const extractedEvents = extractEventsFromPDF(pdfData.text);

    // Return a success message along with the extracted events
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

// Example function to extract events from the parsed PDF text.
// You'll want to customize this to fit your syllabus format.
function extractEventsFromPDF(text) {
  // This is a simple placeholder extraction
  // In a real implementation, you might use regex or NLP to extract dates and event titles.
  const events = [];
  const lines = text.split("\n");
  lines.forEach((line) => {
    if (line.toLowerCase().includes("exam") || line.toLowerCase().includes("assignment")) {
      events.push({
        title: line.trim(),
        start: "2025-04-01T09:00:00", // Replace with actual extracted date/time
        end: "2025-04-01T11:00:00",   // Replace with actual extracted date/time
      });
    }
  });
  return events;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
