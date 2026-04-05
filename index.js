console.log("GNEWS_API_KEY:", process.env.GNEWS_API_KEY ? "OK" : "MISSING");
console.log("NEWS_API_KEY:", process.env.NEWS_API_KEY ? "OK" : "MISSING");

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
    maxHistory: 20
};

const cooldown = new Map();
const RESTRICTED_CHANNEL_ID = "1263597369677582492";

// ===== FUENTES FIABLES =====
const TRUSTED_SOURCES = [
    "bbc", "reuters", "ap", "associated press", "the guardian",
    "nytimes", "washington post", "elpais", "le monde", "dw"
];

// ===== DETECCIÓN =====
function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isOpinionRequest(text) {
    return /(qué opinas|qué piensas|quién tiene razón|quién gana)/i.test(text);
}

function needsCurrentDate(text) {
    return /(hoy|fecha|día actual)/i.test(text);
}

// 🚀 FILTRO RÁPIDO (SIN IA)
function maybeNews(text) {

    const t = text.toLowerCase();

    return (
        t.includes("noticias") ||
        t.includes("actualidad") ||
        t.includes("novedad") ||
        t.includes("reciente") ||
        t.includes("qué pasa") ||
        t.includes("que pasa") ||
        t.includes("qué está pasando") ||
        t.includes("como va") ||
        t.includes("último")
    );
}

// ===== LIMPIEZA =====
function cleanResponse(text) {
    return text
        ?.replace(/como modelo de ia[^.]*\./gi, "")
        ?.replace(/como ia[^.]*\./gi, "")
        ?.trim();
}

// ===== HISTORIAL =====
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

// ===== UTIL =====
function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

function isTrusted(source) {
    return TRUSTED_SOURCES.some(s =>
        source.toLowerCase().includes(s)
    );
}

// ===== 🧠 DETECCIÓN IA =====
async function detectNewsIntent(text) {

    const prompt = `
Analiza esta petición:

"${text}"

Responde SOLO en JSON:
{
  "isNews": true o false,
  "topic": "tema limpio"
}
`;

    try {
        const response = await askGemini([], [{ text: prompt }]);

        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (!jsonMatch) return { isNews: false, topic: "" };

        return JSON.parse(jsonMatch[0]);

    } catch (err) {
        console.error("detectNewsIntent error:", err);
        return { isNews: false, topic: "" };
    }
}

// ===== GNEWS =====
async function fetchGNews(topic) {

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&lang=en&max=5&apikey=${process.env.GNEWS_API_KEY}`;

    console.log("🌍 GNews URL:", url);

    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log("📰 GNews response:", data);

        if (!data.articles) return [];

        return data.articles;

    } catch (err) {
        console.error("❌ GNews error:", err);
        return [];
    }
}

// ===== NEWSAPI =====
async function fetchNewsAPI(topic) {

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&language=en&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`;

    console.log("🌍 NewsAPI URL:", url);

    try {
        const res = await fetch(url);
        const data = await res.json();

        console.log("📰 NewsAPI response:", data);

        if (!data.articles) return [];

        return data.articles;

    } catch (err) {
        console.error("❌ NewsAPI error:", err);
        return [];
    }
}

// ===== AGREGADOR =====
async function fetchNews(topic) {

    const gnews = await fetchGNews(topic);
    const newsapi = await fetchNewsAPI(topic);

    let combined = [...gnews, ...newsapi];

    // quitar duplicados
    const seen = new Set();
    combined = combined.filter(a => {
        const norm = normalizeTitle(a.title);
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
    });

    // priorizar fuentes fiables
    combined.sort((a, b) => (isTrusted(b.source) - isTrusted(a.source)));

    // ordenar por fecha
    combined.sort((a, b) => new Date(b.date) - new Date(a.date));

    return combined.slice(0, 5);
}

// ===== TRADUCCIÓN =====
async function translateToSpanish(text) {
    try {
        return await askGemini([], [{ text: `Traduce al español:\n\n${text}` }]);
    } catch {
        return text;
    }
}

// ===== SLASH =====
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
        return interaction.reply({ content: "🔥 Memoria borrada.", ephemeral: true });
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
    const now = Date.now();

    if (cooldown.has(key) && now - cooldown.get(key) < CONFIG.cooldown) return;
    cooldown.set(key, now);

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

    if (!trigger) return;
    if (!content) content = "Hola";

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

        // ===== 📰 DETECCIÓN OPTIMIZADA =====
        let isNews = false;
        let topic = "";

        if (maybeNews(content)) {
            const intent = await detectNewsIntent(content);
            isNews = intent.isNews;
            topic = intent.topic;
        }

        if (isNews) {

            topic = topic || "world";

            console.log("🧠 Tema IA:", topic);

            const articles = await fetchNews(topic);

            if (!articles.length) {
                return message.reply(`📰 No he encontrado noticias sobre "${topic}".`);
            }

            const translated = await Promise.all(
                articles.map(a => translateToSpanish(a.title))
            );

            const formatted = articles.map((a, i) => {
                const date = new Date(a.date).toLocaleDateString("es-ES");

                return `**${i + 1}. ${translated[i]}**
📰 ${a.source} | ${date}
🔗 ${a.url}`;
            }).join("\n\n");

            return message.reply(`📰 Últimas noticias sobre **${topic}**:\n\n${formatted}`);
        }

        // 🕒 fecha solo si toca
        if (needsCurrentDate(content)) {
            const nowDate = new Date().toLocaleDateString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric"
            });

            content = `Hoy es ${nowDate}.\n\n${content}`;
        }

        // ===== NORMAL =====
        let reply = await askGemini(history, [{ text: content }]);
        reply = cleanResponse(reply);

        history.push(
            { role: "user", parts: [{ text: content }] },
            { role: "model", parts: [{ text: reply }] }
        );

        if (history.length > CONFIG.maxHistory) {
            history = history.slice(-CONFIG.maxHistory);
            if (history[0]?.role === "model") history.shift();
        }

        saveMemory(userId, channelId, history);

        const messages = splitMessage(reply);

        for (let i = 0; i < messages.length; i++) {
            if (i === 0) await message.reply(messages[i]);
            else await message.channel.send(messages[i]);
        }

    } catch (err) {
        console.error(err);
        message.reply("Ahora mismo estoy un poco saturado 😅");
    }
});

client.login(process.env.DISCORD_TOKEN);