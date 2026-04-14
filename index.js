require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const { isAdmin, ADMIN_IDS } = require('./config');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userStates = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  if (!db.getUser(userId)) db.createUser(userId, username);
  showMainMenu(chatId, userId);
});

function showMainMenu(chatId, userId) {
  const user = db.getUser(userId);
  if (!user) return;
  const keyboard = {
    reply_markup: {
      keyboard: [
        [{ text: '🎮 O\'yin o\'ynash' }],
        [{ text: '💰 Balansim' }, { text: '🏆 UC Hisobim' }],
        [{ text: '🎁 UC Olish' }, { text: '💳 Hisob To\'ldirish' }],
      ],
      resize_keyboard: true,
    },
  };
  bot.sendMessage(chatId,
    `👋 Xush kelibsiz, *${user.username}*!\n\n💵 Balans: *${user.balance.toLocaleString()} so'm*\n🏆 UC: *${user.uc} UC*`,
    { parse_mode: 'Markdown', ...keyboard }
  );
}

function showGameMenu(chatId, userId) {
  const user = db.getUser(userId);
  if (user.balance < 3000) {
    bot.sendMessage(chatId, `❌ Balansingiz yetarli emas!\n\n💵 Balans: *${user.balance.toLocaleString()} so'm*\n🎮 O'yin narxi: *3,000 so'm*`,
      { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } });
    return;
  }
  bot.sendMessage(chatId,
    `🎮 *O'YIN*\n\n💵 Balans: *${user.balance.toLocaleString()} so'm*\n🎯 Har urinish: *-3,000 so'm*\n\n🔴 yoki 🔵 ni tanlang!`,
    { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔴 Qizil' }, { text: '🔵 Ko\'k' }], [{ text: '🔙 Orqaga' }]], resize_keyboard: true } }
  );
}

function handleGameChoice(chatId, userId, choice) {
  const user = db.getUser(userId);
  if (user.balance < 3000) {
    bot.sendMessage(chatId, '❌ Balansingiz yetarli emas!');
    showMainMenu(chatId, userId);
    return;
  }
  db.updateBalance(userId, -3000);
  const counter = db.incrementCounter();
  const isWin = counter % 5 === 0;
  const results = ['🔴 Qizil', '🔵 Ko\'k'];
  const displayResult = results[Math.floor(Math.random() * 2)];
  const userChoice = choice === '🔴 Qizil' ? '🔴 Qizil' : '🔵 Ko\'k';
  db.logAttempt(userId, userChoice, displayResult, isWin);
  if (isWin) {
    db.addUC(userId, 60);
    const u = db.getUser(userId);
    bot.sendMessage(chatId, `🎉 *TABRIKLAYMIZ! YUTDINGIZ!*\n\nSiz: ${userChoice} | Natija: ${displayResult}\n\n🏆 *+60 UC qo'shildi!*\n💵 Balans: *${u.balance.toLocaleString()} so'm*\n🏆 Jami UC: *${u.uc} UC*`, { parse_mode: 'Markdown' });
  } else {
    const u = db.getUser(userId);
    bot.sendMessage(chatId, `😔 *Yutmadingiz*\n\nSiz: ${userChoice} | Natija: ${displayResult}\n\n💵 Balans: *${u.balance.toLocaleString()} so'm*\n🏆 UC: *${u.uc} UC*\n\nYana urinib ko'ring! 💪`, { parse_mode: 'Markdown' });
  }
}

function showWithdrawMenu(chatId, userId) {
  const user = db.getUser(userId);
  if (user.uc <= 0) {
    bot.sendMessage(chatId, `❌ UC balansingiz 0!\n\nAvval o'yin o'ynab UC yig'ing.`,
      { reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } });
    return;
  }
  userStates[userId] = { action: 'enter_pubg_id' };
  bot.sendMessage(chatId, `🎁 *UC OLISH*\n\nUC balansingiz: *${user.uc} UC*\n\nPUBG Mobile ID ingizni kiriting:`,
    { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } });
}

function handlePubgId(chatId, userId, pubgId) {
  if (pubgId === '🔙 Orqaga') { delete userStates[userId]; showMainMenu(chatId, userId); return; }
  const user = db.getUser(userId);
  db.createWithdrawRequest(userId, user.username, pubgId, user.uc);
  const ucAmount = user.uc;
  db.resetUC(userId);
  delete userStates[userId];
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId, `🔔 *YANGI UC SO'ROV*\n\n👤 User: @${user.username} (${userId})\n🎮 PUBG ID: \`${pubgId}\`\n🏆 UC: *${ucAmount} UC*`, { parse_mode: 'Markdown' }).catch(() => {});
  });
  bot.sendMessage(chatId, `✅ *So'rovingiz qabul qilindi!*\n\n🎮 PUBG ID: \`${pubgId}\`\n🏆 UC: *${ucAmount} UC*\n\nAdmin tez orada yuboradi! ⏳`, { parse_mode: 'Markdown' });
  showMainMenu(chatId, userId);
}

function showTopup(chatId, userId) {
  userStates[userId] = { action: 'enter_check' };
  bot.sendMessage(chatId,
    `💳 *HISOB TO'LDIRISH*\n\n📱 To'lov rekvizitlari:\n\n🏦 Karta: _tez kunda qo'shiladi_\n\nTo'lov qilib, chek (screenshot) yuboring:`,
    { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } }
  );
}

function handleCheckSubmit(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showMainMenu(chatId, userId); return; }
  const user = db.getUser(userId);
  db.saveCheck(userId, user.username, text);
  delete userStates[userId];
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId, `🧾 *YANGI CHEK*\n\n👤 @${user.username} (${userId})\n📝 ${text}`, { parse_mode: 'Markdown' }).catch(() => {});
  });
  bot.sendMessage(chatId, `✅ Chekingiz adminga yuborildi! Admin tekshirib balans qo'shadi. ⏳`);
  showMainMenu(chatId, userId);
}

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (userStates[userId]?.action === 'enter_check') {
    const user = db.getUser(userId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    db.saveCheck(userId, user.username, `[RASM] ${fileId}`);
    delete userStates[userId];
    ADMIN_IDS.forEach(adminId => {
      bot.sendPhoto(adminId, fileId, { caption: `🧾 *YANGI CHEK*\n👤 @${user.username} (${userId})`, parse_mode: 'Markdown' }).catch(() => {});
    });
    bot.sendMessage(chatId, `✅ Chek rasmi adminga yuborildi! ⏳`);
    showMainMenu(chatId, userId);
  }
});

// Admin
bot.onText(/\/admin/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  showAdminPanel(msg.chat.id, msg.from.id);
});

function showAdminPanel(chatId, userId) {
  bot.sendMessage(chatId, `👑 *ADMIN PANEL*`, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: '👥 Userlar' }, { text: '💸 Balans Qo\'sh' }],
        [{ text: '📋 So\'rovlar' }, { text: '🧾 Cheklar' }],
        [{ text: '🔙 Orqaga' }],
      ],
      resize_keyboard: true,
    }
  });
}

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  if (isAdmin(userId)) {
    if (userStates[userId]?.action === 'admin_add_balance') { handleAdminAddBalance(chatId, userId, text); return; }
    if (userStates[userId]?.action === 'admin_find_user') { handleAdminFindUser(chatId, userId, text); return; }
  }
  if (userStates[userId]?.action === 'enter_pubg_id') { handlePubgId(chatId, userId, text); return; }
  if (userStates[userId]?.action === 'enter_check') { handleCheckSubmit(chatId, userId, text); return; }

  switch (text) {
    case '🎮 O\'yin o\'ynash': showGameMenu(chatId, userId); break;
    case '💰 Balansim': { const u = db.getUser(userId); bot.sendMessage(chatId, `💵 Balans: *${u.balance.toLocaleString()} so'm*\n🏆 UC: *${u.uc} UC*`, { parse_mode: 'Markdown' }); break; }
    case '🏆 UC Hisobim': { const u = db.getUser(userId); bot.sendMessage(chatId, `🏆 UC: *${u.uc} UC*`, { parse_mode: 'Markdown' }); break; }
    case '🎁 UC Olish': showWithdrawMenu(chatId, userId); break;
    case '💳 Hisob To\'ldirish': showTopup(chatId, userId); break;
    case '🔴 Qizil': case '🔵 Ko\'k': handleGameChoice(chatId, userId, text); break;
    case '🔙 Orqaga': showMainMenu(chatId, userId); break;
    case '👑 Admin Panel': if (isAdmin(userId)) showAdminPanel(chatId, userId); break;
    case '👥 Userlar': if (isAdmin(userId)) {
      const users = db.getAllUsers();
      let t = `👥 *USERLAR* (${users.length})\n\n`;
      users.forEach((u, i) => { t += `${i+1}. @${u.username} (${u.user_id})\n💵 ${u.balance.toLocaleString()} | 🏆 ${u.uc} UC\n\n`; });
      bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
      break;
    }
    case '💸 Balans Qo\'sh': if (isAdmin(userId)) {
      userStates[userId] = { action: 'admin_find_user' };
      bot.sendMessage(chatId, `User ID yoki @username kiriting:`, { reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } });
      break;
    }
    case '📋 So\'rovlar': if (isAdmin(userId)) {
      const reqs = db.getWithdrawRequests();
      if (!reqs.length) { bot.sendMessage(chatId, "So'rov yo'q."); break; }
      let t = `📋 *SO'ROVLAR* (${reqs.length})\n\n`;
      reqs.forEach((r, i) => { t += `${i+1}. @${r.username}\n🎮 \`${r.pubg_id}\` | 🏆 ${r.uc_amount} UC\n\n`; });
      bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
      break;
    }
    case '🧾 Cheklar': if (isAdmin(userId)) {
      const checks = db.getChecks();
      if (!checks.length) { bot.sendMessage(chatId, "Chek yo'q."); break; }
      let t = `🧾 *CHEKLAR* (${checks.length})\n\n`;
      checks.forEach((c, i) => { t += `${i+1}. @${c.username}\n📝 ${c.check_data}\n\n`; });
      bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
      break;
    }
  }
});

function handleAdminFindUser(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showAdminPanel(chatId, userId); return; }
  const target = db.findUser(text);
  if (!target) { bot.sendMessage(chatId, `❌ User topilmadi!`); return; }
  userStates[userId] = { action: 'admin_add_balance', targetUserId: target.user_id, targetUsername: target.username };
  bot.sendMessage(chatId, `✅ @${target.username}\n💵 Balans: ${target.balance.toLocaleString()} so'm\n\nQancha so'm qo'shish?`);
}

function handleAdminAddBalance(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showAdminPanel(chatId, userId); return; }
  const amount = parseInt(text.replace(/\s/g, ''));
  if (isNaN(amount) || amount <= 0) { bot.sendMessage(chatId, '❌ Noto\'g\'ri summa!'); return; }
  const { targetUserId, targetUsername } = userStates[userId];
  db.updateBalance(targetUserId, amount);
  delete userStates[userId];
  const u = db.getUser(targetUserId);
  bot.sendMessage(chatId, `✅ @${targetUsername} ga *${amount.toLocaleString()} so'm* qo'shildi!\n💵 Yangi balans: *${u.balance.toLocaleString()} so'm*`, { parse_mode: 'Markdown' });
  bot.sendMessage(targetUserId, `🎉 *Balansingiz to'ldirildi!*\n➕ *+${amount.toLocaleString()} so'm*\n💵 Joriy: *${u.balance.toLocaleString()} so'm*`, { parse_mode: 'Markdown' }).catch(() => {});
  showAdminPanel(chatId, userId);
}

console.log('🤖 Bot ishga tushdi!');
