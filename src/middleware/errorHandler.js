/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  // Database errors
  if (err.code === "23505") {
    // Unique constraint violation
    return res.status(409).json({
      success: false,
      message: "Resource already exists.",
      error: err.detail || "Duplicate entry",
    });
  }

  if (err.code === "23503") {
    // Foreign key violation
    return res.status(400).json({
      success: false,
      message: "Invalid reference.",
      error: "Referenced resource does not exist",
    });
  }

  if (err.code === "23502") {
    // Not null violation
    return res.status(400).json({
      success: false,
      message: "Missing required field.",
      error: err.column || "Required field is missing",
    });
  }

  // Validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: err.errors,
    });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired.",
    });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * 404 handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found.",
    path: req.originalUrl,
  });
}

module.exports = { errorHandler, notFoundHandler };
