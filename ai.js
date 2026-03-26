require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const models = [
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash"
];

async function tryModel(modelName, history, content) {

    const model = genAI.getGenerativeModel({ model: modelName });

    const chat = model.startChat({ history });

    const result = await chat.sendMessage(content);

    return result.response.text();
}

async function askGemini(history, content) {

    for (const modelName of models) {

        for (let attempt = 0; attempt < 2; attempt++) {

            try {
                console.log(`Usando modelo: ${modelName}`);

                return await tryModel(modelName, history, content);

            } catch (err) {

                console.log(`Error con ${modelName}:`, err.status);

                if (err.status === 503 || err.status === 429) {
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }

                break;
            }
        }
    }

    throw new Error("Todos los modelos fallaron");
}

module.exports = { askGemini };