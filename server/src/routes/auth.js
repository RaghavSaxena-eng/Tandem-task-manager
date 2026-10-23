const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { HttpError, wrap } = require('../utils/httpError');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Name is required');
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
    if (!password || String(password).length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({ name, email, passwordHash });
    res.status(201).json({ token: signToken(user.id), user });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'Email and password are required');

    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
    if (!ok) throw new HttpError(401, 'Invalid email or password');

    res.json({ token: signToken(user.id), user });
  })
);

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(401, 'Account no longer exists');
    res.json({ user });
  })
);

module.exports = router;
