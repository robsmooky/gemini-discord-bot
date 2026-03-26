require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

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

// ===== CONFIG =====
const CONFIG = {
    cooldown: 3000,
    maxHistory: 20,
    contextMessages: 6
};

const DISABLED_CONTEXT_CHANNELS = [
    "123456789012345678"
];

// ===== DETECCIÓN =====
function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isOpinionRequest(text) {
    return /(qué opinas|que opinas|qué piensas|que piensas|quién tiene razón|quien tiene razon)/i.test(text);
}

// ===== MEMORIA =====
function shouldStoreMessage(text) {

    if (!text) return false;
    if (text.length < 5) return false;
    if (/^(hola|ok|vale|gracias)$/i.test(text)) return false;

    return true;
}

// ===== LIMPIEZA =====
function cleanResponse(text) {
    if (!text) return text;

    return text
        .replace(/como modelo de ia[^.]*\./gi, "")
        .replace(/como ia[^.]*\./gi, "")
        .replace(/^["']|["']$/g, "")
        .trim();
}

// ===== CONTEXTO =====
function shouldUseContext(content, message) {

    if (DISABLED_CONTEXT_CHANNELS.includes(message.channel.id)) return false;

    if (message.reference) return true;

    if (isOpinionRequest(content)) return true;

    return false;
}

// ===== CONTEXTO DIRECTO OPTIMIZADO =====
async function buildDirectContext(message) {

    const fetched = await message.channel.messages.fetch({ limit: 15 });

    const ordered = [...fetched.values()].reverse();

    const filtered = ordered
        .filter(m =>
            !m.author.bot &&
            m.content &&
            m.content.length > 3 &&
            !m.content.startsWith("http")
        )
        .slice(-CONFIG.contextMessages);

    if (filtered.length < 2) return null;

    let context = "Conversación reciente:\n\n";

    for (const msg of filtered) {
        context += `[Usuario: ${msg.author.username}] dice: ${msg.content}\n`;
    }

    return context;
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
    if (now - last < CONFIG.cooldown) return;
    cooldown.set(message.author.id, now);

    let trigger = false;
    let content = message.content.trim();

    // mención
    if (message.mentions.has(client.user)) {
        trigger = true;
        content = content.replace(/<@!?[0-9]+>/, "").trim();
    }

    // gemini inicio
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

        await message.channel.sendTyping();

        const userId = message.author.id;
        let history = getMemory(userId);

        let finalInput = content;

        const isRestrictedChannel = DISABLED_CONTEXT_CHANNELS.includes(message.channel.id);

        // 🚫 canal sensible
        if (isRestrictedChannel && isOpinionRequest(content)) {
            return message.reply("Prefiero no analizar debates en este canal 🙂");
        }

        // ===== CONTEXTO =====
        if (shouldUseContext(content, message)) {

            const context = await buildDirectContext(message);

            if (context) {
                finalInput = `
${context}

Usuario actual (${message.author.username}) pregunta:
${content}

Responde SOLO a este usuario.
Usa correctamente los nombres.
No confundas quién dijo qué.
`;
            }
        }

        // ===== FOLLOW-UP =====
        if (message.reference) {
            finalInput = `Continuación directa de conversación:\n${finalInput}`;
        }

        let reply = await askGemini(history, finalInput);

        reply = cleanResponse(reply);

        // ===== MEMORIA =====
        if (shouldStoreMessage(content) && shouldStoreMessage(reply)) {

            history.push(
                { role: "user", parts: [{ text: content }] },
                { role: "model", parts: [{ text: reply }] }
            );

            if (history.length > CONFIG.maxHistory) {
                history = history.slice(-CONFIG.maxHistory);
            }

            saveMemory(userId, history);
        }

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

        message.reply("Ahora mismo estoy un poco saturado 😅 Inténtalo en unos segundos.");
    }

});

client.login(process.env.DISCORD_TOKEN);