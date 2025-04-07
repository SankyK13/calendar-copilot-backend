require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { AzureOpenAI } = require("openai");

const app = express();
app.use(express.json());
app.use(cors());

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
