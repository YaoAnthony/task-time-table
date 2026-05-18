const express = require('express');
const jwt = require('jsonwebtoken');
const Coupon = require('../models/Coupon');
const authenticateToken = require('../middlewares/authenticateToken');

const router = express.Router();

const createCoupon = async (code, productId, discountAmount, limit = 1) => {
    // 检查必要字段
    if (!code || !productId || !discountAmount) {
        const error = new Error('Missing required fields: code, productId, discountAmount.');
        error.statusCode = 400;
        throw error;
    }

    // 检查产品类型是否合法
    const validProducts = ["individual", "enterprise"];
    if (!validProducts.includes(productId)) {
        const error = new Error("Invalid productId. Must be 'individual' or 'enterprise'.");
        error.statusCode = 400;
        throw error;
    }

    // 检查是否已存在同名 coupon
    const existing = await Coupon.findOne({ code });
    if (existing) {
        const error = new Error('Coupon code already exists.');
        error.statusCode = 409;
        throw error;
    }

    // 创建
    return Coupon.create({
        code,
        productId,
        discountAmount,
        limit: limit ?? 1,
        valid: true
    });
};

// create coupon verification endpoint
router.post('/create', authenticateToken, async (req, res) => {
    try {
        // 权限检查（请确保你有 user.role 字段）
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: "You do not have permission to create coupons." 
            });
        }

        const { code, productId, discountAmount, limit } = req.body;

        const coupon = await createCoupon(code, productId, discountAmount, limit);
        return res.status(201).json({
            success: true,
            message: "Coupon created successfully.",
            coupon
        });

    } catch (error) {
        console.error("Error creating coupon:", error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: "Error creating coupon.",
            error: error.message
        });
    }
});


router.post('/verify', authenticateToken, async (req, res) => {
    const { code, productId } = req.body;
    const userId = req.user.id;

    if (!userId) {
        return res.status(400).json({
            valid: false,
            message: 'User authentication failed. Please login again.'
        });
    }

    // 查找 coupon
    const coupon = await Coupon.findOne({ code, productId, valid: true });

    if (!coupon) {
        return res.json({
            valid: false,
            discountAmount: 0,
            message: "Invalid coupon or product."
        });
    }

    // 限制次数，默认 1
    const maxUse = coupon.limit || 1;

    // 已使用次数
    const usedCount = coupon.usedBy.length;

    // 是否已经超过次数
    if (usedCount >= maxUse) {
        return res.json({
            valid: false,
            discountAmount: 0,
            message: "This coupon has already been fully redeemed."
        });
    }

    // 是否已被该用户使用
    if (coupon.usedBy.includes(userId)) {
        return res.json({
            valid: false,
            discountAmount: 0,
            message: "You have already used this coupon."
        });
    }

    // 验证通过
    return res.json({
        valid: true,
        discountAmount: coupon.discountAmount,
        message: `Coupon applied! You saved $${coupon.discountAmount}.`,
        onlyOnce: maxUse === 1
    });
});



module.exports = router;
