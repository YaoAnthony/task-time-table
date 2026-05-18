const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('Counter', {
  collection: 'Counter',
  timestamps: false,
  defaults: () => ({
    seq: 0,
  }),
});
