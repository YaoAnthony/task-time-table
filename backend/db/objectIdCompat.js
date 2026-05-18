const crypto = require('crypto');

function createObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

function isValidObjectId(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);
}

module.exports = {
  createObjectId,
  Types: {
    ObjectId: {
      isValid: isValidObjectId,
    },
  },
};
