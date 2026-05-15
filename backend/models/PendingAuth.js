// models/PendingAuth.js
const mongoose = require('mongoose');

const pendingAuthSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  redirectUrl: { type: String, required: true },
  accessToken: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // 1小时后自动过期
});

module.exports = mongoose.model('PendingAuth', pendingAuthSchema);
