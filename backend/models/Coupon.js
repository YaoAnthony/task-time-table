const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('Coupon', {
  collection: 'Coupon',
  timestamps: false,
  defaults: () => ({
    code: '',
    productId: '',
    discountAmount: 0,
    valid: true,
    usedBy: [],
    limit: 0,
  }),
});
