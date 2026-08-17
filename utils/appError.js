// Operational error with an HTTP status, consumed by the central error handler
class AppError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

module.exports = AppError;
