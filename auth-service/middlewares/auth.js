const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/prisma');
const AppError = require('../utils/appError');
const config = require('../utils/config');

const protect = async (req, res, next) => {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return next(new AppError('Not authorized, no token.', 401));
    }

    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, config.JWT_SECRET);

        req.user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, name: true, email: true }
        });

        if (!req.user) {
            return next(new AppError('Not authorized, user not found.', 401));
        }

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new AppError('Not authorized, token failed.', 401));
        }
        next(error);
    }
};

module.exports = { protect };
