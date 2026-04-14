const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 0,
    uc INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS global_counter (
    id INTEGER PRIMARY KEY DEFAULT 1,
    counter INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    choice TEXT,
    result TEXT,
    is_win INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS withdraw_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    pubg_id TEXT,
    uc_amount INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    check_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const counter = db.prepare('SELECT * FROM global_counter WHERE id = 1').get();
if (!counter) {
  db.prepare('INSERT INTO global_counter (id, counter) VALUES (1, 0)').run();
}

module.exports = {
  createUser(userId, username) {
    db.prepare(`INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)`).run(String(userId), username);
  },
  getUser(userId) {
    return db.prepare('SELECT * FROM users WHERE user_id = ?').get(String(userId));
  },
  findUser(query) {
    const byId = db.prepare('SELECT * FROM users WHERE user_id = ?').get(String(query));
    if (byId) return byId;
    return db.prepare('SELECT * FROM users WHERE username = ?').get(query.replace('@', ''));
  },
  getAllUsers() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  },
  updateBalance(userId, amount) {
    db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ?').run(amount, String(userId));
  },
  addUC(userId, amount) {
    db.prepare('UPDATE users SET uc = uc + ? WHERE user_id = ?').run(amount, String(userId));
  },
  resetUC(userId) {
    db.prepare('UPDATE users SET uc = 0 WHERE user_id = ?').run(String(userId));
  },
  incrementCounter() {
    db.prepare('UPDATE global_counter SET counter = counter + 1 WHERE id = 1').run();
    return db.prepare('SELECT counter FROM global_counter WHERE id = 1').get().counter;
  },
  logAttempt(userId, choice, result, isWin) {
    db.prepare(`INSERT INTO attempts (user_id, choice, result, is_win) VALUES (?, ?, ?, ?)`).run(String(userId), choice, result, isWin ? 1 : 0);
  },
  createWithdrawRequest(userId, username, pubgId, ucAmount) {
    db.prepare(`INSERT INTO withdraw_requests (user_id, username, pubg_id, uc_amount) VALUES (?, ?, ?, ?)`).run(String(userId), username, pubgId, ucAmount);
  },
  getWithdrawRequests() {
    return db.prepare('SELECT * FROM withdraw_requests ORDER BY created_at DESC LIMIT 50').all();
  },
  saveCheck(userId, username, checkData) {
    db.prepare(`INSERT INTO checks (user_id, username, check_data) VALUES (?, ?, ?)`).run(String(userId), username, checkData);
  },
  getChecks() {
    return db.prepare('SELECT * FROM checks ORDER BY created_at DESC LIMIT 50').all();
  },
};
