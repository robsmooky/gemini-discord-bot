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

// ===== SLASH COMMANDS =====
client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    // /reset
    if (interaction.commandName === "reset") {
        clearMemory(userId, channelId);
        return interaction.reply({
            content: "🧠 Memoria reiniciada en este canal.",
            ephemeral: true
        });
    }

    // /resetall (solo admins)
    if (interaction.commandName === "resetall") {

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({
                content: "❌ Solo administradores pueden usar este comando.",
                ephemeral: true
            });
        }

        clearAllMemory();

        return interaction.reply({
            content: "🔥 Toda la memoria del bot ha sido borrada.",
            ephemeral: true
        });
    }

    // /memory
    if (interaction.commandName === "memory") {
        const summary = getMemorySummary(userId, channelId);

        return interaction.reply({
            content: `🧠 Últimos recuerdos:\n\n${summary}`,
            ephemeral: true
        });
    }
});

// ===== READY =====
client.on("ready", () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ===== RESTO DE TU BOT =====
// (NO CAMBIA NADA de tu lógica actual de mensajes)

client.login(process.env.DISCORD_TOKEN);