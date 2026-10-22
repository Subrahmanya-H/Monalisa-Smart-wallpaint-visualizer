const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { requireAuth } = require('../middleware/middleware');

const router = express.Router();
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$/;

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'customer',
  };
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function validAdminKey(suppliedKey) {
  const configuredKey = process.env.ADMIN_REGISTRATION_KEY;
  if (!configuredKey || typeof suppliedKey !== 'string') {
    return false;
  }

  const supplied = Buffer.from(suppliedKey);
  const expected = Buffer.from(configuredKey);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function createAccount(req, res, role) {
  const { name, email, password } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.trim().length > 80 ||
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    !passwordPattern.test(password)
  ) {
    return res.status(400).json({
      message: 'Enter a valid name and email. Passwords must be 8-128 characters and include uppercase, lowercase, and a number.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.exists({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 12),
    role,
  });

  setSessionCookie(res, user);
  return res.status(201).json({ user: publicUser(user) });
}

router.post('/register', async (req, res, next) => {
  try {
    return await createAccount(req, res, 'customer');
  } catch (error) {
    return next(error);
  }
});

router.post('/admin-register', async (req, res, next) => {
  if (!validAdminKey(req.body?.adminKey)) {
    return res.status(403).json({ message: 'The administrator registration key is invalid or not configured.' });
  }

  try {
    return await createAccount(req, res, 'admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+password');
    if (!user || !password) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    const hasBcryptPassword = bcryptHashPattern.test(user.password);
    let passwordMatches = false;
    if (hasBcryptPassword) {
      passwordMatches = await bcrypt.compare(password, user.password);
    } else if (typeof user.password === 'string') {
      const supplied = Buffer.from(password);
      const stored = Buffer.from(user.password);
      passwordMatches = supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
    }

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    const hasLegacyRole = user.role !== 'admin' && user.role !== 'customer';
    if (!hasBcryptPassword || hasLegacyRole) {
      if (!hasBcryptPassword) {
        user.password = await bcrypt.hash(password, 12);
      }
      if (hasLegacyRole) {
        user.role = 'customer';
      }
      await user.save();
    }

    setSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.status(204).end();
});

module.exports = router;
