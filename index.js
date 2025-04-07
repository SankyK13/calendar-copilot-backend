require("dotenv/config");
const express = require("express");
const cors = require("cors");
const OpenAIClient = require("@azure/openai").OpenAIClient;
const { AzureKeyCredential } = require("@azure/core-auth");

const app = express();
app.use(cors());
app.use(express.json());

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const assistantId = process.env.ASSISTANT_ID;

if (!endpoint || !apiKey || !assistantId) {
  throw new Error("Please set AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT, and ASSISTANT_ID in your .env file.");
}

const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

let threadId = null;

app.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    if (!threadId) {
      const thread = await client.createThread();
      threadId = thread.id;
    }

    await client.createMessage(threadId, {
      role: "user",
      content: message,
    });

    const run = await client.createRun(threadId, { assistantId });

    let runStatus = run.status;
    while (runStatus === "queued" || runStatus === "in_progress") {
      await new Promise((r) => setTimeout(r, 1000));
      const statusRes = await client.getRun(threadId, run.id);
      runStatus = statusRes.status;
    }

    if (runStatus !== "completed") {
      return res.json({ response: "Assistant didn't complete the task. 😕" });
    }

    const messages = await client.listMessages(threadId);
    const lastMessage = messages.data.find((m) => m.role === "assistant");

    if (!lastMessage || !lastMessage.content?.length) {
      return res.json({ response: "No reply 😕" });
    }

    const reply = lastMessage.content[0].text.value;
    res.json({ response: reply });

  } catch (error) {
    console.error("Assistant error:", error);
    res.status(500).json({ response: "Something went wrong. 😕" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
