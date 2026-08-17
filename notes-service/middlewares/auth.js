const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const config = require('../utils/config');

// Middleware to validate JWT token signatures for Notes Service.
// It verifies the token using JWT_SECRET and attaches the decoded payload (id, email) to req.user.
const protect = (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return next(new AppError('Not authorized, no token.', 401));
    }

    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // Attach decoded user information (id, email)
        req.user = {
            id: decoded.id,
            email: decoded.email
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new AppError('Not authorized, token failed.', 401));
        }
        next(error);
    }
};

module.exports = { protect };
