const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"
    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
        console.log("Decoded token:", decoded);
        req.user = decoded; // 现在 req.user 包含了 token 中的信息
        next();
    } catch (err) {
        console.error("Token verification failed:", err);
        if (err?.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
};

module.exports = authenticateToken;
