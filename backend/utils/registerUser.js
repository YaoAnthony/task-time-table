// utils/registerUser.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');

const PendingAuth = require('../models/PendingAuth');

async function registerUser({ email, password }, state = null) {
    // 检查是否已存在
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new Error('User already exists');
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户和初始 profile
    let newUser = new User({
        email,
        password: passwordHash,
        username: "DefuzerUser",
        image_url: "https://www.svgrepo.com/show/452030/avatar-default.svg",
        subscription: {
            level: 'free',
            subscribedAt: null,
            expiryDate: null,
            renewalPeriod: null
        },
        profile: null,
    });

    const newProfile = new Profile({
        user: newUser._id,
        paymentMethods: [],
        teams: [],
        projects: []
    });

    newUser.profile = newProfile._id;

    await Promise.all([
        newUser.save(),
        newProfile.save()
    ]);


    // 如果是 VS Code 注册，存储 token
    if (state) {
        await PendingAuth.findOneAndUpdate(
            { state },
            { new: true }
        );
    }
    newUser.password = ''; // to avoid returning password hash
    return { user: newUser };
}

module.exports = registerUser;
