// backend/src/middlewares/errorHandler.js

const errorHandler = (err, req, res, next) => {
    console.error(err.stack); // Log the error stack for debugging

    // Default status code and message
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Something went wrong!';

    // Handle specific types of errors if needed
    // Example: Supabase errors might have a 'code' or 'status' field
    if (err.code && typeof err.code === 'string' && err.code.startsWith('PGR')) { // Postgres error codes
        statusCode = 400;
        message = 'Database error: ' + err.message;
    } else if (err.status) { // For errors coming from other parts (e.g. 401 from authMiddleware)
        statusCode = err.status;
    }


    // Don't expose sensitive error details in production
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'An unexpected error occurred.';
    }

    res.status(statusCode).json({ error: message });
};

export default errorHandler; // Export as default