const jwt = require('jsonwebtoken');

// 检查 req.body.code 是否为合法 JWT 的中间件
const authenticateCodeTokenByPost = (req, res, next) => {
    const token = req.body.code;
    console.log('Authenticating code token from POST body:', token);
    if (!token) {
        return res.status(401).json({ message: 'No code (token) provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
        req.user = decoded; // 挂到 req.user
        next();
    } catch (err) {
        console.error("Code token verification failed:", err);
        return res.status(403).json({ message: 'Invalid code (token)' });
    }
}

module.exports = authenticateCodeTokenByPost;
