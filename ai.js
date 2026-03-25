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

// ===== PROMPT =====
async function buildImagePrompt(userPrompt) {
  const instruction = `
You are an expert AI image prompt engineer.

Choose best style (realistic, anime, digital art, oil painting).
Describe subject, action, environment, lighting.
Keep it clean and natural.

Output ONLY the prompt.
`;

  const result = await model.generateContent(instruction + "\nUser: " + userPrompt);
  const response = await result.response;

  return response.text().trim().slice(0, 400);
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

// ===== IMAGEN ROBUSTA =====
async function generateImage(userPrompt) {

  const finalPrompt = await buildImagePrompt(userPrompt);
  const encoded = encodeURIComponent(finalPrompt);

  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${Math.floor(Math.random()*100000)}`;

  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url);

      if (res.ok) {
        const buffer = await res.arrayBuffer();
        return Buffer.from(buffer);
      }

    } catch {}

    await new Promise(r => setTimeout(r, 1500));
  }

  return null;
}

module.exports = { askGemini, generateImage, buildImageNarrative };