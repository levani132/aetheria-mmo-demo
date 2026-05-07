export default function HUD({ vitals, self, target, zoneLabel, inSafeZone }) {
  if (!self) return null;
  const xpForNext = xpForLevel(vitals.level + 1);
  const xpForCurr = xpForLevel(vitals.level);
  const xpInLvl = vitals.xp - xpForCurr;
  const xpLvlSpan = xpForNext - xpForCurr;
  const xpPct = Math.max(0, Math.min(100, (xpInLvl / xpLvlSpan) * 100));
  const hpPct = Math.max(0, Math.min(100, (vitals.hp / vitals.maxHp) * 100));
  const mpPct = Math.max(0, Math.min(100, (vitals.mp / vitals.maxMp) * 100));

  return (
    <>
      <div className="hud-top">
        <div className={`zone-label ${inSafeZone ? 'safe' : 'pvp'}`}>
          {zoneLabel}
        </div>
      </div>

      <div className="hud-self">
        <div className="portrait">
          <div className={`portrait-frame ${self.charClass}`}>
            <div className="portrait-icon">
              {self.charClass === 'warrior' ? '⚔' : '✦'}
            </div>
            <div className="portrait-level">{vitals.level}</div>
          </div>
        </div>
        <div className="bars">
          <div className="bar-row">
            <div className="bar hp">
              <div className="fill" style={{ width: `${hpPct}%` }} />
              <div className="bar-text">{Math.ceil(vitals.hp)} / {vitals.maxHp}</div>
            </div>
          </div>
          <div className="bar-row">
            <div className="bar mp">
              <div className="fill" style={{ width: `${mpPct}%` }} />
              <div className="bar-text">{Math.ceil(vitals.mp)} / {vitals.maxMp}</div>
            </div>
          </div>
          <div className="bar-row">
            <div className="bar xp">
              <div className="fill" style={{ width: `${xpPct}%` }} />
              <div className="bar-text">XP  {Math.floor(xpInLvl)} / {xpLvlSpan}</div>
            </div>
          </div>
          <div className="gold-row">
            <span className="gold-icon">●</span>
            <span className="gold-amt">{vitals.gold}</span>
            <span className="gold-label">gold</span>
          </div>
        </div>
      </div>

      {target && (
        <div className="hud-target">
          <div className="target-name">{target.name}</div>
          {target.maxHp != null && (
            <div className="bar hp small">
              <div className="fill" style={{ width: `${(target.hp / target.maxHp) * 100}%` }} />
              <div className="bar-text">{Math.max(0, Math.ceil(target.hp))} / {target.maxHp}</div>
            </div>
          )}
        </div>
      )}

      <div className="controls-help">
        <div><kbd>W A S D</kbd> move</div>
        <div><kbd>L-Click</kbd> select / move-to</div>
        <div><kbd>R-Click drag</kbd> camera</div>
        <div><kbd>Wheel</kbd> zoom</div>
        <div><kbd>I</kbd> inventory · <kbd>B</kbd> shop · <kbd>Enter</kbd> chat</div>
      </div>
    </>
  );
}

function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 2.1));
}
