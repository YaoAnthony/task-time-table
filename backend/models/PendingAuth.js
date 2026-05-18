const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('PendingAuth', {
  collection: 'PendingAuth',
  timestamps: false,
  defaults: () => ({
    state: '',
    clientId: '',
    redirectUrl: '',
    accessToken: null,
    used: false,
    createdAt: new Date().toISOString(),
  }),
});
