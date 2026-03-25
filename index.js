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
const DISABLED_CONTEXT_CHANNELS = [
    "1263597369677582492" // canal de política
];

// ===== DETECCIÓN =====
function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isOpinionRequest(text) {
    return /(qué opinas|que opinas|qué piensas|que piensas|quién tiene razón|quien tiene razon)/i.test(text);
}

function shouldUseContext(content, message) {

    if (DISABLED_CONTEXT_CHANNELS.includes(message.channel.id)) {
        return false;
    }

    if (content.length < 80) return true;

    if (message.reference) return true;

    if (isOpinionRequest(content)) return true;

    return false;
}

// ===== FILTRAR MENSAJES =====
function filterMessages(messages) {
    return messages
        .filter(m =>
            !m.author.bot &&
            m.content &&
            m.content.length > 3 &&
            !m.content.startsWith("http")
        )
        .slice(-8);
}

// ===== RESUMIR CONTEXTO =====
async function summarizeContext(messages) {

    let raw = "";

    for (const msg of messages) {
        raw += `${msg.author.username}: ${msg.content}\n`;
    }

    const prompt = `
Resume this conversation briefly.

- Who is saying what
- Main disagreement or topic
- Max 5 lines

Conversation:
${raw}
`;

    return await askGemini([], prompt);
}

// ===== CONSTRUIR CONTEXTO =====
async function buildSmartContext(message) {

    const fetched = await message.channel.messages.fetch({ limit: 15 });
    const ordered = [...fetched.values()].reverse();
    const filtered = filterMessages(ordered);

    if (filtered.length < 2) return null;

    try {
        const summary = await summarizeContext(filtered);
        return `Contexto de la conversación:\n${summary}`;
    } catch {
        return null;
    }
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

        await message.channel.sendTyping();

        const userId = message.author.id;
        let history = getMemory(userId);

        let finalInput = content;

        const isRestrictedChannel = DISABLED_CONTEXT_CHANNELS.includes(message.channel.id);

        // ===== BLOQUEO SOLO PARA DEBATES =====
        if (isRestrictedChannel && isOpinionRequest(content)) {
            return message.reply("Prefiero no analizar debates en este canal 🙂");
        }

        // ===== CONTEXTO INTELIGENTE =====
        if (shouldUseContext(content, message)) {

            const context = await buildSmartContext(message);

            if (context) {
                finalInput = `${context}\n\nUsuario pregunta:\n${content}`;
            }
        }

        const reply = await askGemini(history, finalInput);

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