require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");

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

// ===== CONFIG =====
const CONFIG = {
    cooldown: 3000,
    maxHistory: 20,
    contextMessages: 6
};

const cooldown = new Map();

// 🔴 canal restringido
const RESTRICTED_CHANNEL_ID = "1263597369677582492";

// ===== DETECCIÓN =====
function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isOpinionRequest(text) {
    return /(qué opinas|que opinas|qué piensas|que piensas|quién tiene razón|quien tiene razon|quién gana|quien gana|qué es mejor|que es mejor|quién está equivocado|quien esta equivocado)/i.test(text);
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

// ===== MEMORIA =====
function shouldStoreMessage(text) {
    if (!text) return false;
    if (text.length < 5) return false;
    if (/^(hola|ok|vale|gracias)$/i.test(text)) return false;

    return true;
}

// ===== CONTEXTO =====
async function injectContextAsHistory(history, message) {

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

    for (const msg of filtered) {
        history.push({
            role: "user",
            parts: [{
                text: `[Usuario: ${msg.author.username}] dice: ${msg.content}`
            }]
        });
    }

    return history;
}

// ===== IMÁGENES =====
async function getImageParts(message) {

    if (!message.attachments.size) return [];

    const parts = [];

    for (const attachment of message.attachments.values()) {

        if (!attachment.contentType?.startsWith("image/")) continue;

        const res = await fetch(attachment.url);
        const buffer = await res.arrayBuffer();

        parts.push({
            inlineData: {
                data: Buffer.from(buffer).toString("base64"),
                mimeType: attachment.contentType
            }
        });
    }

    return parts;
}

// ===== READY =====
client.on("ready", () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const key = `${message.author.id}-${message.channel.id}`;
    const now = Date.now();

    if (cooldown.has(key) && now - cooldown.get(key) < CONFIG.cooldown) {
        return;
    }

    cooldown.set(key, now);

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

    if (!content) content = "Describe esta imagen";

    try {

        // 🔴 BLOQUEO DE OPINIONES
        if (
            message.channel.id === RESTRICTED_CHANNEL_ID &&
            isOpinionRequest(content)
        ) {
            return message.reply("Prefiero no analizar debates en este canal 🙂");
        }

        await message.channel.sendTyping();

        const userId = message.author.id;
        const channelId = message.channel.id;

        let history = getMemory(userId, channelId);

        // 🔴 NO USAR CONTEXTO EN ESTE CANAL
        const isRestrictedChannel = channelId === RESTRICTED_CHANNEL_ID;

        if (!isRestrictedChannel && (message.reference || isOpinionRequest(content))) {
            history = await injectContextAsHistory(history, message);
        }

        // 🖼️ imagen
        const imageParts = await getImageParts(message);

        const contentParts = [];

        if (content) {
            contentParts.push({ text: content });
        }

        contentParts.push(...imageParts);

        console.log({
            user: message.author.username,
            content,
            images: imageParts.length,
            historyLength: history.length,
            restricted: isRestrictedChannel
        });

        let reply = await askGemini(history, contentParts);

        reply = cleanResponse(reply);

        // guardar memoria (esto sí se mantiene)
        if (shouldStoreMessage(content) && shouldStoreMessage(reply)) {

            history.push(
                { role: "user", parts: [{ text: content }] },
                { role: "model", parts: [{ text: reply }] }
            );

            if (history.length > CONFIG.maxHistory) {
                history = history.slice(-CONFIG.maxHistory);
            }

            saveMemory(userId, channelId, history);
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