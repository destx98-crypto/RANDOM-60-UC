const ADMIN_IDS = [5620975465];

function isAdmin(userId) {
  return ADMIN_IDS.includes(Number(userId));
}

module.exports = { ADMIN_IDS, isAdmin };
