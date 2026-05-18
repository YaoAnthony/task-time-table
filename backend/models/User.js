const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('User', {
  collection: 'User',
  timestamps: false,
  defaults: () => ({
    username: 'User0001',
    isVerified: false,
    email: '',
    password: null,
    subscription: {
      level: 'free',
      subscribedAt: null,
      expiryDate: null,
      renewalPeriod: null,
    },
    image_url: 'https://www.svgrepo.com/show/452030/avatar-default.svg',
    profile: null,
  }),
});
