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

// evitar duplicados
const processedMessages = new Set();

// cooldown por usuario
const cooldown = new Map();

function startsWithGemini(text) {
    return /^gemini[\s:,.!?-]/i.test(text);
}

function isImageRequest(text) {
    return /^(imagine|imagen|dibujar|draw|create image)/i.test(text);
}

client.on("ready", () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    // evitar mensajes duplicados
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 60000);

    // cooldown (3 segundos)
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

    // empieza por Gemini
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

        // ===== GENERACIÓN DE IMÁGENES =====
        if (isImageRequest(content)) {

            const prompt = content.replace(/^(imagine|imagen|dibujar|draw|create image)\s*/i, "");

            const imageBase64 = await generateImage(prompt);

            if (!imageBase64) {
                return message.reply("No se pudo generar la imagen.");
            }

            const buffer = Buffer.from(imageBase64, "base64");

            return message.reply({
                files: [{
                    attachment: buffer,
                    name: "image.png"
                }]
            });
        }

        // ===== TEXTO (GEMINI NORMAL) =====
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