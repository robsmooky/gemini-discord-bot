const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview"
});

async function askGemini(history, userMessage) {

    const chat = model.startChat({
        history: history
    });

    const result = await chat.sendMessage(userMessage);
    const response = await result.response;

    return response.text();
}

async function generateImage(prompt) {

    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite-preview"
    });

    const result = await model.generateContent({
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
        }
    });

    const response = await result.response;

    const parts = response.candidates[0].content.parts;

    for (const part of parts) {
        if (part.inlineData) {
            return part.inlineData.data; // base64
        }
    }

    return null;
}

module.exports = { askGemini, generateImage };
