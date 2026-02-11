/**
 * Validation middleware factory
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        })),
      });
    }

    req.validatedBody = value;
    next();
  };
}

/**
 * Common validation rules
 */
const Joi = require("joi");

const validationRules = {
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(8).max(100).required(),
  firstName: Joi.string().min(2).max(100).trim().required(),
  lastName: Joi.string().min(2).max(100).trim().required(),
  phone: Joi.string()
    .min(6)
    .max(20)
    .pattern(/^[0-9+\-\s()]+$/)
    .message("Please enter a valid phone number")
    .required(),
  role: Joi.string().valid("driver", "passenger", "both").required(),
  objectId: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),
  direction: Joi.string()
    .valid("home_to_airport", "airport_to_home")
    .required(),
  datetime: Joi.date().iso().min("now").required(),
  positiveInt: Joi.number().integer().min(1).required(),
  price: Joi.number().positive().precision(2).required(),
  postcode: Joi.string().max(10).trim().required(),
  city: Joi.string().max(100).trim().required(),
};

module.exports = { validate, validationRules, Joi };
