const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const couponSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    productId: {
        type: String,
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    },
    valid: {
        type: Boolean,
        required: true,
        default: true
    },
    usedBy: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        default: []
    },
    limit: {
        type: Number,
        required: false,
        default: 0
    }
}, {
    // 明确指定集合名字为 "Coupon"
    collection: 'Coupon'
});

module.exports = mongoose.model('Coupon', couponSchema);