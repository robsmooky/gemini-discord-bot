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

module.exports = askGemini;
