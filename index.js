require("dotenv").config();

const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const fetch = require("node-fetch");

const { askGemini } = require("./ai");
const {
    getMemory,
    saveMemory,
    clearMemory,
    clearAllMemory,
    getMemorySummary
} = require("./memory");

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
const RESTRICTED_CHANNEL_ID = "1263597369677582492";

// ===== DETECCIÓN =====
function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isOpinionRequest(text) {
    return /(qué opinas|que opinas|qué piensas|que piensas|quién tiene razón|quien tiene razon|quién gana|quien gana|qué es mejor|que es mejor|quién está equivocado)/i.test(text);
}

function isNewsRequest(text) {
    return /(noticias|últimas noticias|ultimas noticias|actualidad|qué ha pasado|que ha pasado)/i.test(text);
}

function needsCurrentDate(text) {
    return /(hoy|fecha|día actual|que dia es|qué día es|ahora|actualmente)/i.test(text);
}

function extractNewsTopic(text) {
    return text
        .replace(/gemini/i, "")
        .replace(/noticias|últimas noticias|ultimas noticias|actualidad|qué ha pasado|que ha pasado/gi, "")
        .trim() || "general";
}

// ===== LIMPIEZA =====
function cleanResponse(text) {
    if (!text) return text;

    return text
        .replace(/como modelo de ia[^.]*\./gi, "")
        .replace(/como ia[^.]*\./gi, "")
        .trim();
}

// ===== MEMORIA =====
function shouldStoreMessage(text) {
    if (!text) return false;
    if (text.length < 5) return false;
    if (/^(hola|ok|vale|gracias)$/i.test(text)) return false;

    return true;
}

// ===== SANITIZE =====
function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];

    let clean = history.filter(m =>
        m &&
        (m.role === "user" || m.role === "model") &&
        Array.isArray(m.parts)
    );

    while (clean.length && clean[0].role !== "user") {
        clean.shift();
    }

    return clean;
}

// ===== 📰 NOTICIAS REALES (CORREGIDO) =====
async function fetchNews(topic) {

    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return null;

    const url = `https://newsapi.org/v2/top-headlines?q=${encodeURIComponent(topic)}&language=en&pageSize=10&apiKey=${apiKey}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.articles) return null;

        // 🔥 FILTRO: últimos 3 días
        const now = Date.now();

        const recentArticles = data.articles.filter(a => {
            const published = new Date(a.publishedAt).getTime();
            return (now - published) < (1000 * 60 * 60 * 24 * 3);
        });

        if (!recentArticles.length) return null;

        return recentArticles.slice(0, 5).map(a => {
            const date = new Date(a.publishedAt).toLocaleDateString("es-ES");
            return `- ${a.title}
  📰 ${a.source.name} | ${date}
  🔗 ${a.url}`;
        }).join("\n\n");

    } catch (err) {
        console.error("Error fetching news:", err);
        return null;
    }
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

// ===== SLASH COMMANDS =====
client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    if (interaction.commandName === "reset") {
        clearMemory(userId, channelId);
        return interaction.reply({ content: "🧠 Memoria reiniciada.", ephemeral: true });
    }

    if (interaction.commandName === "resetall") {

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: "❌ Solo admins.", ephemeral: true });
        }

        clearAllMemory();
        return interaction.reply({ content: "🔥 Memoria global borrada.", ephemeral: true });
    }

    if (interaction.commandName === "memory") {
        const summary = getMemorySummary(userId, channelId);
        return interaction.reply({ content: summary, ephemeral: true });
    }
});

// ===== READY =====
client.on("ready", () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ===== MENSAJES =====
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    const key = `${message.author.id}-${message.channel.id}`;
    const nowTs = Date.now();

    if (cooldown.has(key) && nowTs - cooldown.get(key) < CONFIG.cooldown) return;
    cooldown.set(key, nowTs);

    let trigger = false;
    let content = message.content.trim();

    if (message.mentions.has(client.user)) {
        trigger = true;
        content = content.replace(/<@!?[0-9]+>/, "").trim();
    }

    if (startsWithGemini(content)) {
        trigger = true;
        content = content.replace(/^gemini[\s:,.!?-]*/i, "").trim();
    }

    if (message.reference) {
        try {
            const replied = await message.channel.messages.fetch(message.reference.messageId);
            if (replied.author.id === client.user.id) trigger = true;
        } catch {}
    }

    if (!trigger) return;
    if (!content) content = "Describe esta imagen";

    try {

        if (
            message.channel.id === RESTRICTED_CHANNEL_ID &&
            isOpinionRequest(content)
        ) {
            return message.reply("Prefiero no analizar debates en este canal 🙂");
        }

        await message.channel.sendTyping();

        const userId = message.author.id;
        const channelId = message.channel.id;

        let history = sanitizeHistory(getMemory(userId, channelId));

        // ===== 🕒 FECHA SOLO SI NO ES NOTICIA =====
        if (needsCurrentDate(content) && !isNewsRequest(content)) {

            const now = new Date();
            const currentDate = now.toLocaleDateString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            });

            content = `Hoy es ${currentDate}.\n\n${content}`;
        }

        // ===== 📰 NOTICIAS =====
        if (isNewsRequest(content)) {

            const topic = extractNewsTopic(content);
            const news = await fetchNews(topic);

            if (news) {
                content = `
NOTICIAS REALES RECIENTES SOBRE "${topic}":

${news}

INSTRUCCIONES:
- Resume estas noticias
- Usa SOLO la información proporcionada
- NO inventes nada
- NO hagas escenarios hipotéticos
`;
            } else {
                content = "No se han encontrado noticias recientes fiables sobre ese tema.";
            }
        }

        const imageParts = await getImageParts(message);

        const contentParts = [];
        if (content) contentParts.push({ text: content });
        contentParts.push(...imageParts);

        let reply = await askGemini(history, contentParts);
        reply = cleanResponse(reply);

        if (shouldStoreMessage(content) && shouldStoreMessage(reply)) {

            history.push(
                { role: "user", parts: [{ text: content }] },
                { role: "model", parts: [{ text: reply }] }
            );

            if (history.length > CONFIG.maxHistory) {
                history = history.slice(-CONFIG.maxHistory);
                if (history[0]?.role === "model") history.shift();
            }

            saveMemory(userId, channelId, history);
        }

        const messages = splitMessage(reply);

        for (let i = 0; i < messages.length; i++) {
            if (i === 0) await message.reply(messages[i]);
            else await message.channel.send(messages[i]);
        }

    } catch (err) {
        console.error(err);
        message.reply("Ahora mismo estoy un poco saturado 😅 Inténtalo en unos segundos.");
    }
});

client.login(process.env.DISCORD_TOKEN);