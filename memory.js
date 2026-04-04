const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "memory.json");

let memory = new Map();

// ===== CARGAR =====
function loadMemory() {
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
            memory = new Map(Object.entries(data));
        }
    } catch (err) {
        console.error("Error cargando memoria:", err);
    }
}

// ===== GUARDAR =====
function persistMemory() {
    try {
        const obj = Object.fromEntries(memory);
        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error("Error guardando memoria:", err);
    }
}

// ===== HELPERS =====
function getKey(userId, channelId) {
    return `${userId}-${channelId}`;
}

// ===== GET =====
function getMemory(userId, channelId) {
    const key = getKey(userId, channelId);
    const data = memory.get(key) || [];
    return JSON.parse(JSON.stringify(data));
}

// ===== SAVE =====
function saveMemory(userId, channelId, history) {
    const key = getKey(userId, channelId);
    memory.set(key, history);
    persistMemory();
}

// ===== RESET =====
function clearMemory(userId, channelId) {
    memory.delete(getKey(userId, channelId));
    persistMemory();
}

function clearAllMemory() {
    memory.clear();
    persistMemory();
}

// ===== VER MEMORIA =====
function getReadableMemory(userId, channelId) {
    const history = getMemory(userId, channelId);

    if (!history.length) return "No hay memoria guardada.";

    return history
        .map(m => `${m.role === "user" ? "👤 Usuario" : "🤖 Bot"}: ${m.parts[0].text}`)
        .join("\n\n")
        .slice(0, 1800);
}

// ===== 🧠 FILTRO INTELIGENTE =====
async function shouldRemember(askGemini, text) {

    if (!text || text.length < 10) return false;

    // filtro rápido (evita llamadas innecesarias)
    if (/^(hola|ok|vale|gracias|xd|jaja)$/i.test(text)) return false;

    const prompt = `
Decide si este mensaje contiene información importante para recordar a largo plazo.

Responde SOLO con "SI" o "NO".

IMPORTANTE SI:
- gustos del usuario
- preferencias
- datos personales no sensibles
- contexto útil a futuro

NO:
- saludos
- preguntas normales
- respuestas casuales

Mensaje:
"${text}"
`;

    try {
        const result = await askGemini([], [{ text: prompt }]);
        return result.toLowerCase().includes("si");
    } catch {
        return false;
    }
}

// cargar al iniciar
loadMemory();

module.exports = {
    getMemory,
    saveMemory,
    clearMemory,
    clearAllMemory,
    getReadableMemory,
    shouldRemember
};