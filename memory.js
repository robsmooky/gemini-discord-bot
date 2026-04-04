const memory = new Map();

function getKey(userId, channelId) {
    return `${userId}-${channelId}`;
}

function getMemory(userId, channelId) {
    const key = getKey(userId, channelId);
    const data = memory.get(key) || [];
    return JSON.parse(JSON.stringify(data));
}

function saveMemory(userId, channelId, history) {
    const key = getKey(userId, channelId);
    memory.set(key, history);
}

function clearMemory(userId, channelId) {
    const key = getKey(userId, channelId);
    memory.delete(key);
}

function clearAllMemory() {
    memory.clear();
}

function getMemorySummary(userId, channelId) {
    const history = getMemory(userId, channelId);

    if (!history.length) return "No hay memoria guardada.";

    return history
        .map(m => `${m.role === "user" ? "👤 Usuario" : "🤖 Bot"}: ${m.parts[0].text}`)
        .slice(-10)
        .join("\n\n");
}

module.exports = {
    getMemory,
    saveMemory,
    clearMemory,
    clearAllMemory,
    getMemorySummary
};