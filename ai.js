const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ===== SEGURIDAD =====
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

const model = genAI.getGenerativeModel({
  model: "gemini-3.1-flash-lite-preview",
  safetySettings
});

// ===== CHAT =====
async function askGemini(history, userMessage) {
  try {
    const chat = model.startChat({ history });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;

    return response.text();

  } catch (err) {
    if (err.message?.includes("SAFETY")) {
      return "Vaya… eso es demasiado explícito incluso para mí. Bajemos el tono 😉";
    }
    throw err;
  }
}

// ===== PROMPT SIMPLIFICADO =====
async function buildImagePrompt(userPrompt) {

  const instruction = `
Rewrite this into a SHORT and SIMPLE image prompt.

Rules:
- Max 10-15 words
- Only essential elements
- No artistic or cinematic terms
- No extra adjectives

User request:
${userPrompt}
`;

  const result = await model.generateContent(instruction);
  const response = await result.response;

  return response.text().trim();
}

// ===== NARRATIVA =====
async function buildImageNarrative(userPrompt) {
  const prompt = `
Create:
1. A short creative title
2. A cinematic description (2-3 lines)

Based on:
${userPrompt}
`;

  const result = await model.generateContent(prompt);
  const response = await result.response;

  return response.text();
}

// ===== GENERACIÓN ROBUSTA =====
async function generateImage(userPrompt) {

  const tryPrompt = async (prompt) => {

    const clean = prompt
      .replace(/["']/g, "")
      .slice(0, 120);

    const encoded = encodeURIComponent(clean);

    const url = `https://pollinations.ai/p/${encoded}?width=1024&height=1024&seed=${Math.floor(Math.random()*100000)}&nologo=true`;

    const res = await fetch(url);

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok || !contentType.startsWith("image")) {
      throw new Error("No image");
    }

    const buffer = await res.arrayBuffer();

    if (buffer.byteLength < 10000) {
      throw new Error("Too small");
    }

    return Buffer.from(buffer);
  };

  // intento 1: prompt simplificado por IA
  try {
    const simplePrompt = await buildImagePrompt(userPrompt);
    return await tryPrompt(simplePrompt);
  } catch (err) {
    console.log("Fallback a prompt original...");
  }

  // intento 2: prompt original
  try {
    return await tryPrompt(userPrompt);
  } catch (err) {
    console.log("También falló el prompt original");
  }

  return null;
}

module.exports = { askGemini, generateImage, buildImageNarrative };