require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { askGemini, generateImage } = require("./ai");
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

// ===== DETECCIÓN INTELIGENTE =====
function isImageRequest(text) {
    return /(imagen|dibujo|dibujar|draw|imagine|pintar|crear imagen|hazme.*(dibujo|imagen))/i.test(text);
}

function wantsExplanation(text) {
    return /(explica|describe|qué es|que es|details|explain|describe)/i.test(text);
}

function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

client.on("ready", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // evitar duplicados
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 60000);

    // cooldown
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

    // Gemini al inicio
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

    await message.channel.sendTyping();

    try {

        // ===== IMAGEN =====
        if (isImageRequest(content)) {

            const imageUrl = await generateImage(content);

            // imagen + explicación en UNA llamada
            if (wantsExplanation(content)) {

                const explanation = await askGemini([], `Describe this scene in a natural way:\n${content}`);

                await message.reply(imageUrl);
                return message.channel.send(explanation);
            }

            return message.reply(imageUrl);
        }

        // ===== TEXTO =====
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
        message.reply("Ha ocurrido un error al contactar con Gemini.");
    }

});

client.login(process.env.DISCORD_TOKEN);