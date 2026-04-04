require("dotenv").config();

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("reset")
        .setDescription("Borra tu memoria en este canal"),

    new SlashCommandBuilder()
        .setName("resetall")
        .setDescription("Borra toda la memoria del bot (admin)"),

    new SlashCommandBuilder()
        .setName("memory")
        .setDescription("Ver qué recuerda el bot de ti")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log("🔄 Registrando comandos...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID // ⚡ rápido (solo servidor)
            ),
            { body: commands }
        );

        console.log("✅ Comandos registrados");
    } catch (error) {
        console.error(error);
    }
})();