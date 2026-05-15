// utils/loginUser.js
const bcrypt = require('bcrypt');
const User = require('../models/User');

/**
 *  returns user if email and password are correct
 * @param {string} email 
 * @param {string} password 
 * @returns 
 */
async function loginUser({ email, password }) {
  let user = await User.findOne({ email });
  if (!user) throw new Error('Invalid email');

  const passwordHash = user.password;
  if (!passwordHash) throw new Error('Invalid password');

  const validPassword = await bcrypt.compare(password, passwordHash);
  if (!validPassword) throw new Error('Invalid password');

  user.password = ''; // to avoid returning password hash
  return { user };
}
module.exports = loginUser;
