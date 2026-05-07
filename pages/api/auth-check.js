// REST endpoint used by CharacterSelect to decide which step to show.
// The actual security check is *also* done at socket-join time — this endpoint
// is just a UX hint, not the only line of defense.

import { PlayerStore } from '../../lib/models';
const { verifyPassword } = require('../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !/^[a-zA-Z0-9_]{2,16}$/.test(username)) {
    return res.status(200).json({ ok: false, error: 'Username must be 2–16 letters, numbers, or underscores.' });
  }
  if (!password || typeof password !== 'string' || password.length < 4) {
    return res.status(200).json({ ok: false, error: 'Password must be at least 4 characters.' });
  }

  try {
    const record = await PlayerStore.findOne({ username });

    if (!record) {
      return res.status(200).json({ ok: true, exists: false });
    }
    if (!verifyPassword(password, record.passwordHash)) {
      return res.status(200).json({ ok: false, exists: true, error: 'Wrong password.' });
    }
    return res.status(200).json({
      ok: true,
      exists: true,
      character: {
        charClass: record.charClass,
        gender: record.gender,
        level: record.level,
      },
    });
  } catch (e) {
    console.error('auth-check error:', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
