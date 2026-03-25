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

    if (
      err.message?.includes("SAFETY") ||
      err.message?.includes("blocked")
    ) {
      return "Vaya… eso que me pides es un poco demasiado explícito incluso para mí. Bajemos el tono 😉";
    }

    throw err;
  }
}

// ===== GENERADOR DE PROMPTS =====
async function buildImagePrompt(userPrompt) {

  const promptBuilder = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview",
    safetySettings
  });

  const instruction = `
You are an expert AI image prompt engineer.

1. Choose best style:
- photorealistic
- digital art
- anime
- oil painting

2. Write a detailed prompt in English including:
- subject
- action
- environment
- style
- lighting

3. Add only relevant technical modifiers.

4. Keep it clean, not overloaded.

Output ONLY the prompt.
`;

  const result = await promptBuilder.generateContent(
    instruction + "\nUser request: " + userPrompt
  );

  const response = await result.response;

  return response.text().trim();
}

async function generateImage(userPrompt) {
  try {
    const finalPrompt = await buildImagePrompt(userPrompt);

    const encoded = encodeURIComponent(finalPrompt);
    return `https://image.pollinations.ai/prompt/${encoded}`;

  } catch (err) {

    if (
      err.message?.includes("SAFETY") ||
      err.message?.includes("blocked")
    ) {
      return "⚠️ No puedo generar esa imagen, es demasiado explícita.";
    }

    throw err;
  }
}

module.exports = { askGemini, generateImage };