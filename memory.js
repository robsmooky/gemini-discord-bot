const memory = new Map();

function getKey(userId, channelId) {
    return `${userId}-${channelId}`;
}

function getMemory(userId, channelId) {
    const key = getKey(userId, channelId);

    const data = memory.get(key) || [];

    // 🔥 evitar mutaciones accidentales
    return JSON.parse(JSON.stringify(data));
}

function saveMemory(userId, channelId, history) {
    const key = getKey(userId, channelId);

    memory.set(key, history);
}

module.exports = {
    getMemory,
    saveMemory
};