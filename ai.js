require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const models = [
    "gemini-2.5-flash",
    "gemini-1.5-flash"
];

async function tryModel(modelName, history, content) {

    const model = genAI.getGenerativeModel({ model: modelName });

    const chat = model.startChat({
        history: Array.isArray(history) ? history : []
    });

    const result = await chat.sendMessage(content);

    return result.response.text();
}

async function askGemini(history, content) {

    if (!Array.isArray(history)) history = [];

    for (const modelName of models) {

        for (let attempt = 0; attempt < 2; attempt++) {

            try {
                console.log(`🧠 Modelo: ${modelName} | Intento: ${attempt + 1}`);
                console.log(`📚 Historial: ${history.length}`);

                return await tryModel(modelName, history, content);

            } catch (err) {

                const status = err?.status || err?.response?.status;

                console.log(`❌ Error con ${modelName}:`, status);

                if (status === 503 || status === 429) {
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