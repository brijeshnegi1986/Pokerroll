require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn("WARNING: ANTHROPIC_API_KEY is not set. /api/analyze will return 500.");
}

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "PokerTracker AI Proxy", keySet: !!ANTHROPIC_API_KEY });
});

app.post("/api/analyze", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }

  const { userMessage } = req.body;
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "userMessage is required" });
  }

  const systemPrompt = `You are an expert No-Limit Hold'em poker coach. Analyze the hand provided and return ONLY a valid JSON object with no markdown, no explanation outside the JSON. Use this exact shape:
{"preflop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"A"},"flop":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"B"},"turn":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"C"},"river":{"heroAction":"...","assessment":"...","suggestion":"...","reasoning":"...","grade":"D"},"summary":"Overall hand summary in 2-3 sentences"}
Only include streets that were actually played. Grades: A = excellent, B = good, C = marginal, D = mistake.`;

  try {
    console.log("Calling Anthropic API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const responseText = await response.text();
    console.log("Anthropic status:", response.status);

    if (!response.ok) {
      console.error("Anthropic error body:", responseText);
      let errMsg = `Anthropic API error ${response.status}`;
      try { errMsg = JSON.parse(responseText)?.error?.message ?? errMsg; } catch (_) {}
      return res.status(response.status).json({ error: errMsg });
    }

    const data = JSON.parse(responseText);
    const text = data.content?.[0]?.text ?? "";
    console.log("Anthropic response received, length:", text.length);
    res.json({ text });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.post("/api/enhance-notes", async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
  }
  const { notes, sessionContext } = req.body;
  if (!notes || typeof notes !== "string") {
    return res.status(400).json({ error: "notes is required" });
  }
  const systemPrompt = `You are a poker session journal editor. Rewrite the provided poker session notes to be clear, well-structured and easy to read.
Rules:
- Fix grammar, spelling, and punctuation
- Use bullet points for multiple observations or hands
- Use correct poker terminology (c-bet, 3-bet, value bet, bluff, tilt, range, equity, etc.)
- Preserve every piece of original content — do not add content that wasn't implied
- Add concise section headers only when the notes naturally cover distinct topics (e.g. "Key Hands:", "Observations:", "Leaks to Fix:")
- Keep the total length similar to the original (don't pad it out)
- Return ONLY the improved notes text, with no preamble or explanation`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: `Session: ${sessionContext || "N/A"}\n\nNotes to improve:\n${notes}` }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Anthropic API error ${response.status}`;
      try { errMsg = JSON.parse(errText)?.error?.message ?? errMsg; } catch (_) {}
      return res.status(response.status).json({ error: errMsg });
    }
    const data = await response.json();
    const enhanced = data.content?.[0]?.text ?? notes;
    res.json({ enhanced });
  } catch (err) {
    console.error("enhance-notes error:", err.message);
    res.status(500).json({ error: "Internal server error: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`PokerTracker AI proxy running on port ${PORT}`);
  console.log(`API key set: ${!!ANTHROPIC_API_KEY}`);
});
