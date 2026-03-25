require("dotenv").config();

const { 
    Client, 
    GatewayIntentBits 
} = require("discord.js");

const { askGemini } = require("./ai");
const { getMemory, saveMemory } = require("./memory");
const splitMessage = require("./splitMessage");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const processedMessages = new Set();
const cooldown = new Map();

// ===== DETECCIÓN DE IMAGEN =====
function isImageRequest(text) {

    const creationIntent = /(haz|crea|genera|dibuja|pinta|imagina|make|create|draw|generate)/i;
    const imageWords = /(imagen|dibujo|ilustración|render|picture|image)/i;

    const strongPatterns = [
        /hazme.*(imagen|dibujo)/i,
        /crea.*(imagen|dibujo)/i,
        /genera.*(imagen|dibujo)/i,
        /dibuja/i,
        /imagen de/i,
        /draw/i,
        /imagine/i
    ];

    if (strongPatterns.some(p => p.test(text))) return true;
    if (creationIntent.test(text) && imageWords.test(text)) return true;

    return false;
}

function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

// ===== READY =====
client.on("ready", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 60000);

    const now = Date.now();
    const last = cooldown.get(message.author.id) || 0;
    if (now - last < 3000) return;
    cooldown.set(message.author.id, now);

    let trigger = false;
    let content = message.content.trim();

    // mención
    if (message.mentions.has(client.user)) {
        trigger = true;
        content = content.replace(/<@!?[0-9]+>/, "").trim();
    }

    // "Gemini ..."
    if (startsWithGemini(content)) {
        trigger = true;
        content = content.replace(/^gemini[\s:,.!?-]*/i, "").trim();
    }

    // respuesta al bot
    if (message.reference) {
        try {
            const replied = await message.channel.messages.fetch(message.reference.messageId);
            if (replied.author.id === client.user.id) {
                trigger = true;
            }
        } catch {}
    }

    if (!trigger) return;

    if (!content) content = "Hola";

    try {

        // ===== SI PIDEN IMAGEN =====
        if (isImageRequest(content)) {
            return message.reply(
                "Ahora mismo no puedo generar imágenes 😅\n" +
                "Pero puedo ayudarte a describirla o crear un prompt si quieres."
            );
        }

        // ===== TEXTO =====
        await message.channel.sendTyping();

        const userId = message.author.id;
        let history = getMemory(userId);

        const reply = await askGemini(history, content);

        history.push(
            { role: "user", parts: [{ text: content }] },
            { role: "model", parts: [{ text: reply }] }
        );

        if (history.length > 20) history = history.slice(-20);

        saveMemory(userId, history);

        const messages = splitMessage(reply);

        for (let i = 0; i < messages.length; i++) {
            if (i === 0) {
                await message.reply(messages[i]);
            } else {
                await message.channel.send(messages[i]);
            }
        }

    } catch (err) {
        console.error(err);
        message.reply("Ha ocurrido un error.");
    }

});

client.login(process.env.DISCORD_TOKEN);