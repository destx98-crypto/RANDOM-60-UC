require('dotenv').config();
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot ishlayapti!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlayapti`));

const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const { isAdmin, ADMIN_IDS } = require('./config');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const userStates = {};

// ==================== START ====================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  if (!text) return;

  const username = msg.from.username || msg.from.first_name;
  if (!db.getUser(userId)) db.createUser(userId, username);
  const user = db.getUser(userId);

  // Admin states
  if (isAdmin(userId)) {
    if (userStates[userId]?.action === 'admin_find_user') { handleAdminFindUser(chatId, userId, text); return; }
    if (userStates[userId]?.action === 'admin_add_balance') { handleAdminAddBalance(chatId, userId, text); return; }
  }

  // User states
  if (userStates[userId]?.action === 'enter_pubg_id') { handlePubgId(chatId, userId, text); return; }
  if (userStates[userId]?.action === 'enter_check') { handleCheckSubmit(chatId, userId, text); return; }

  // Commands
  if (text === '/start') { showMainMenu(chatId, userId); return; }
  if (text === '/admin') { if (isAdmin(userId)) showAdminPanel(chatId, userId); return; }

  switch (text) {
    case '🎮 O\'yin o\'ynash': showGameMenu(chatId, userId); break;
    case '🔴 Qizil': case '🔵 Ko\'k': handleGameChoice(chatId, userId, text); break;
    case '💰 Balansim':
      bot.sendMessage(chatId, `💵 Balans: *${user.balance.toLocaleString()} so'm*\n🏆 UC: *${user.uc} UC*`, { parse_mode: 'Markdown' }); break;
    case '🏆 UC Hisobim':
      bot.sendMessage(chatId, `🏆 UC: *${user.uc} UC*`, { parse_mode: 'Markdown' }); break;
    case '🎁 UC Olish': showWithdrawMenu(chatId, userId); break;
    case '💳 Hisob To\'ldirish': showTopup(chatId, userId); break;
    case '🔙 Orqaga': showMainMenu(chatId, userId); break;

    // Admin buttons
    case '👥 Userlar':
      if (!isAdmin(userId)) break;
      const users = db.getAllUsers();
      let t = `👥 *USERLAR* (${users.length})\n\n`;
      users.forEach((u, i) => { t += `${i+1}. @${u.username} (${u.user_id})\n💵 ${u.balance.toLocaleString()} | 🏆 ${u.uc} UC\n\n`; });
      bot.sendMessage(chatId, t, { parse_mode: 'Markdown' });
      break;

    case '💸 Balans Qo\'sh':
      if (!isAdmin(userId)) break;
      userStates[userId] = { action: 'admin_find_user' };
      bot.sendMessage(chatId, `👤 User ID yoki @username kiriting:`, {
        reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true }
      });
      break;

    case '📋 So\'rovlar':
      if (!isAdmin(userId)) break;
      const reqs = db.getWithdrawRequests();
      if (!reqs.length) { bot.sendMessage(chatId, "So'rov yo'q."); break; }
      let tr = `📋 *SO'ROVLAR* (${reqs.length})\n\n`;
      reqs.forEach((r, i) => { tr += `${i+1}. @${r.username}\n🎮 \`${r.pubg_id}\` | 🏆 ${r.uc_amount} UC\n\n`; });
      bot.sendMessage(chatId, tr, { parse_mode: 'Markdown' });
      break;

    case '🧾 Cheklar':
      if (!isAdmin(userId)) break;
      const checks = db.getChecks();
      if (!checks.length) { bot.sendMessage(chatId, "Chek yo'q."); break; }
      let tc = `🧾 *CHEKLAR* (${checks.length})\n\n`;
      checks.forEach((c, i) => { tc += `${i+1}. @${c.username}\n📝 ${c.check_data}\n\n`; });
      bot.sendMessage(chatId, tc, { parse_mode: 'Markdown' });
      break;

    case '👑 Admin Panel':
      if (isAdmin(userId)) showAdminPanel(chatId, userId);
      break;
  }
});

// ==================== PHOTO ====================
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (userStates[userId]?.action === 'enter_check') {
    const user = db.getUser(userId);
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    db.saveCheck(userId, user.username, `[RASM] ${fileId}`);
    delete userStates[userId];
    ADMIN_IDS.forEach(adminId => {
      bot.sendPhoto(adminId, fileId, {
        caption: `🧾 *YANGI CHEK*\n👤 @${user.username} (${userId})`,
        parse_mode: 'Markdown'
      }).catch(() => {});
    });
    bot.sendMessage(chatId, `✅ Chek rasmi adminga yuborildi! ⏳`);
    showMainMenu(chatId, userId);
  }
});

// ==================== FUNCTIONS ====================
function showMainMenu(chatId, userId) {
  const user = db.getUser(userId);
  if (!user) return;
  bot.sendMessage(chatId,
    `👋 Xush kelibsiz, *${user.username}*!\n\n💵 Balans: *${user.balance.toLocaleString()} so'm*\n🏆 UC: *${user.uc} UC*`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '🎮 O\'yin o\'ynash' }],
          [{ text: '💰 Balansim' }, { text: '🏆 UC Hisobim' }],
          [{ text: '🎁 UC Olish' }, { text: '💳 Hisob To\'ldirish' }],
        ],
        resize_keyboard: true,
      }
    }
  );
}

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

function showGameMenu(chatId, userId) {
  const user = db.getUser(userId);
  if (user.balance < 3000) {
    bot.sendMessage(chatId,
      `❌ Balansingiz yetarli emas!\n\n💵 Balans: *${user.balance.toLocaleString()} so'm*\n🎮 O'yin narxi: *3,000 so'm*`,
      { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } }
    );
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
  db.logAttempt(userId, choice, displayResult, isWin);
  if (isWin) {
    db.addUC(userId, 60);
    const u = db.getUser(userId);
    bot.sendMessage(chatId,
      `🎉 *TABRIKLAYMIZ! YUTDINGIZ!*\n\nSiz: ${choice} | Natija: ${displayResult}\n\n🏆 *+60 UC qo'shildi!*\n💵 Balans: *${u.balance.toLocaleString()} so'm*\n🏆 Jami UC: *${u.uc} UC*`,
      { parse_mode: 'Markdown' }
    );
  } else {
    const u = db.getUser(userId);
    bot.sendMessage(chatId,
      `😔 *Yutmadingiz*\n\nSiz: ${choice} | Natija: ${displayResult}\n\n💵 Balans: *${u.balance.toLocaleString()} so'm*\n🏆 UC: *${u.uc} UC*\n\nYana urinib ko'ring! 💪`,
      { parse_mode: 'Markdown' }
    );
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
  bot.sendMessage(chatId,
    `🎁 *UC OLISH*\n\nUC: *${user.uc} UC*\n\nPUBG Mobile ID ingizni kiriting:`,
    { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } }
  );
}

function handlePubgId(chatId, userId, pubgId) {
  if (pubgId === '🔙 Orqaga') { delete userStates[userId]; showMainMenu(chatId, userId); return; }
  const user = db.getUser(userId);
  const ucAmount = user.uc;
  db.createWithdrawRequest(userId, user.username, pubgId, ucAmount);
  db.resetUC(userId);
  delete userStates[userId];
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId,
      `🔔 *YANGI UC SO'ROV*\n\n👤 @${user.username} (${userId})\n🎮 PUBG ID: \`${pubgId}\`\n🏆 UC: *${ucAmount} UC*`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });
  bot.sendMessage(chatId,
    `✅ *So'rovingiz qabul qilindi!*\n\n🎮 PUBG ID: \`${pubgId}\`\n🏆 UC: *${ucAmount} UC*\n\nAdmin tez orada yuboradi! ⏳`,
    { parse_mode: 'Markdown' }
  );
  showMainMenu(chatId, userId);
}

function showTopup(chatId, userId) {
  userStates[userId] = { action: 'enter_check' };
  bot.sendMessage(chatId,
    `💳 *HISOB TO'LDIRISH*\n\n🏦 Karta: _tez kunda qo'shiladi_\n\nTo'lov qilib, chek (screenshot) yuboring:`,
    { parse_mode: 'Markdown', reply_markup: { keyboard: [[{ text: '🔙 Orqaga' }]], resize_keyboard: true } }
  );
}

function handleCheckSubmit(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showMainMenu(chatId, userId); return; }
  const user = db.getUser(userId);
  db.saveCheck(userId, user.username, text);
  delete userStates[userId];
  ADMIN_IDS.forEach(adminId => {
    bot.sendMessage(adminId,
      `🧾 *YANGI CHEK*\n\n👤 @${user.username} (${userId})\n📝 ${text}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  });
  bot.sendMessage(chatId, `✅ Chekingiz adminga yuborildi! ⏳`);
  showMainMenu(chatId, userId);
}

function handleAdminFindUser(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showAdminPanel(chatId, userId); return; }
  const target = db.findUser(text);
  if (!target) { bot.sendMessage(chatId, `❌ User topilmadi: ${text}`); return; }
  userStates[userId] = { action: 'admin_add_balance', targetUserId: target.user_id, targetUsername: target.username };
  bot.sendMessage(chatId,
    `✅ Topildi: @${target.username}\n💵 Balans: ${target.balance.toLocaleString()} so'm\n\nQancha so'm qo'shish kerak?`
  );
}

function handleAdminAddBalance(chatId, userId, text) {
  if (text === '🔙 Orqaga') { delete userStates[userId]; showAdminPanel(chatId, userId); return; }
  const amount = parseInt(text.replace(/\s/g, ''));
  if (isNaN(amount) || amount <= 0) { bot.sendMessage(chatId, '❌ Faqat raqam kiriting!'); return; }
  const { targetUserId, targetUsername } = userStates[userId];
  db.updateBalance(targetUserId, amount);
  delete userStates[userId];
  const u = db.getUser(targetUserId);
  bot.sendMessage(chatId,
    `✅ @${targetUsername} ga *${amount.toLocaleString()} so'm* qo'shildi!\n💵 Yangi balans: *${u.balance.toLocaleString()} so'm*`,
    { parse_mode: 'Markdown' }
  );
  bot.sendMessage(targetUserId,
    `🎉 *Balansingiz to'ldirildi!*\n➕ *+${amount.toLocaleString()} so'm*\n💵 Joriy: *${u.balance.toLocaleString()} so'm*`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
  showAdminPanel(chatId, userId);
}

console.log('🤖 Bot ishga tushdi!');
