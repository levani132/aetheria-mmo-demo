import { useState } from 'react';

export default function CharacterSelect({ onJoin }) {
  // 'login' = step 1, 'create' = step 2 (only shown for brand-new accounts)
  const [step, setStep] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [charClass, setCharClass] = useState('warrior');
  const [gender, setGender] = useState('male');
  const [race, setRace] = useState('human');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Step 1 → check whether this is a new or existing account
  const submitLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(username)) {
      setError('Username must be 2–16 letters, numbers, or underscores.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/auth-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await r.json();
      if (!data.ok) {
        setError(data.error || 'Could not verify.');
        setBusy(false);
        return;
      }
      if (data.exists) {
        // returning user — straight into the realm
        onJoin({ username, password });
      } else {
        // new account — pick a class/gender first
        setStep('create');
      }
    } catch (err) {
      setError('Server unreachable.');
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = (e) => {
    e.preventDefault();
    setError('');
    onJoin({ username, password, charClass, gender, race });
  };

  const back = () => {
    setStep('login');
    setError('');
  };

  return (
    <div className="select-root">
      <div className="select-bg" />
      <div className="select-vignette" />

      <div className="select-content">
        <div className="hero-block">
          <div className="hero-eyebrow">A realm of stone and steel</div>
          <h1 className="hero-title">Aetheria</h1>
          <div className="hero-divider">
            <span className="hero-rule" />
            <span className="ornament">❦</span>
            <span className="hero-rule" />
          </div>
          <p className="hero-tag">
            Sharpen a blade. Kindle a flame. Step beyond the gates.
          </p>
        </div>

        {step === 'login' && (
          <form className="select-form" onSubmit={submitLogin}>
            <label className="field">
              <span className="field-label">Adventurer's name</span>
              <input
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Aldric"
                maxLength={16}
                autoComplete="username"
              />
            </label>

            <label className="field">
              <span className="field-label">Passphrase</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                maxLength={64}
                autoComplete="current-password"
              />
            </label>

            <div className="login-hint">
              New name? An account will be forged for you on the next step.
            </div>

            {error && <div className="form-error">{error}</div>}

            <button className="enter-btn" type="submit" disabled={busy}>
              <span>{busy ? 'Verifying…' : 'Continue'}</span>
              <span className="enter-arrow">→</span>
            </button>
          </form>
        )}

        {step === 'create' && (
          <form className="select-form" onSubmit={submitCreate}>
            <div className="welcome-block">
              <div className="welcome-eyebrow">Welcome, {username}</div>
              <div className="welcome-text">
                A new soul enters the realm. Choose your shape.
              </div>
            </div>

            <div className="field">
              <span className="field-label">Choose your path</span>
              <div className="class-grid">
                <button
                  type="button"
                  className={`class-card ${charClass === 'warrior' ? 'selected' : ''}`}
                  onClick={() => setCharClass('warrior')}
                >
                  <div className="class-glyph">⚔</div>
                  <div className="class-name">Warrior</div>
                  <div className="class-desc">Steel and shield. Endure the front line.</div>
                  <div className="class-stats">
                    <span>HP 100</span><span>ATK 10</span><span>DEF 6</span>
                  </div>
                </button>
                <button
                  type="button"
                  className={`class-card ${charClass === 'mage' ? 'selected' : ''}`}
                  onClick={() => setCharClass('mage')}
                >
                  <div className="class-glyph">✦</div>
                  <div className="class-name">Mage</div>
                  <div className="class-desc">Arcane fire from a distance. Fragile, fierce.</div>
                  <div className="class-stats">
                    <span>HP 70</span><span>MATK 12</span><span>MP 80</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="field">
              <span className="field-label">Lineage</span>
              <div className="gender-row">
                <button
                  type="button"
                  className={`gender-pill ${race === 'human' ? 'selected' : ''}`}
                  onClick={() => setRace('human')}
                >Human</button>
                <button
                  type="button"
                  className={`gender-pill ${race === 'elves' ? 'selected' : ''}`}
                  onClick={() => setRace('elves')}
                >Elves</button>
              </div>
              {race === 'elves' && charClass === 'mage' && gender === 'female' && (
                <div className="login-hint" style={{ marginTop: 6 }}>
                  ❦ The Icebound Enchantress — a rigged elven form.
                </div>
              )}
            </div>

            <div className="field">
              <span className="field-label">Form</span>
              <div className="gender-row">
                <button
                  type="button"
                  className={`gender-pill ${gender === 'male' ? 'selected' : ''}`}
                  onClick={() => setGender('male')}
                >Male</button>
                <button
                  type="button"
                  className={`gender-pill ${gender === 'female' ? 'selected' : ''}`}
                  onClick={() => setGender('female')}
                >Female</button>
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="btn-row">
              <button type="button" className="back-btn" onClick={back}>
                ← Back
              </button>
              <button className="enter-btn" type="submit">
                <span>Enter the Realm</span>
                <span className="enter-arrow">→</span>
              </button>
            </div>
          </form>
        )}

        <div className="form-hint">
          Open this page in a second browser window with a different name to test multiplayer.
        </div>
      </div>

      <div className="select-footer">
        <span>Aetheria  ·  a multiplayer demo</span>
        <span>Three.js  ·  Socket.io  ·  MongoDB optional</span>
      </div>
    </div>
  );
}
