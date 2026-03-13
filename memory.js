const Database = require("better-sqlite3");

const db = new Database("memory.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS memory (
    userId TEXT PRIMARY KEY,
    history TEXT
)
`).run();

function getMemory(userId) {
    const row = db.prepare("SELECT history FROM memory WHERE userId = ?").get(userId);
    if (!row) return [];
    return JSON.parse(row.history);
}

function saveMemory(userId, history) {
    db.prepare(`
        INSERT INTO memory (userId, history)
        VALUES (?, ?)
        ON CONFLICT(userId) DO UPDATE SET history=excluded.history
    `).run(userId, JSON.stringify(history));
}

module.exports = { getMemory, saveMemory };
