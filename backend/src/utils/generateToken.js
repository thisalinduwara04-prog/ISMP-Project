const jwt = require('jsonwebtoken');
const env = require('../config/env');

function generateToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, department: user.department },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

module.exports = generateToken;
