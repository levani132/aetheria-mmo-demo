import { ITEMS } from '../lib/gamedata';

const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armor', helmet: 'Helmet', ring: 'Ring' };

export default function Inventory({ self, vitals, onEquip, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal inventory" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Inventory</h2>

        <div className="char-summary">
          <div className="char-name">{self.username}</div>
          <div className="char-meta">
            Lv. {vitals.level} {capitalize(self.charClass)} ({self.gender})
          </div>
          <div className="stat-grid">
            <Stat label="ATK" v={self.atk} />
            <Stat label="DEF" v={self.def} />
            <Stat label="MATK" v={self.matk} />
            <Stat label="MDEF" v={self.mdef} />
          </div>
        </div>

        <h3 className="section-h">Equipped</h3>
        <div className="equip-grid">
          {['weapon', 'armor', 'helmet', 'ring'].map(slot => {
            const id = self.equipment?.[slot];
            const item = id && ITEMS[id];
            return (
              <div className="equip-slot" key={slot}>
                <div className="slot-label">{SLOT_LABELS[slot]}</div>
                <div className={`slot-content ${item ? 'filled' : 'empty'}`}>
                  {item ? <ItemTooltip item={item} /> : <span className="slot-empty">— none —</span>}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="section-h">Carried</h3>
        <div className="inv-list">
          {(self.inventory || []).length === 0 && (
            <div className="empty-msg">Your pack is empty. Visit the shop in town.</div>
          )}
          {(self.inventory || []).map(slot => {
            const item = ITEMS[slot.id];
            if (!item) return null;
            const isEquipped = Object.values(self.equipment || {}).includes(slot.id);
            return (
              <div className="inv-row" key={slot.id}>
                <ItemTooltip item={item} />
                <div className="inv-actions">
                  {item.slot && (
                    <button onClick={() => onEquip(slot.id)} disabled={isEquipped}>
                      {isEquipped ? 'Equipped' : 'Equip'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, v }) {
  return <div className="stat"><span className="stat-l">{label}</span><span className="stat-v">{v}</span></div>;
}

function ItemTooltip({ item }) {
  const tier = item.tier || 1;
  return (
    <div className={`item-card tier-${tier}`}>
      <div className="item-name">{item.name}</div>
      <div className="item-stats">
        {item.atk  ? <span className="s-atk">+{item.atk} ATK</span> : null}
        {item.def  ? <span className="s-def">+{item.def} DEF</span> : null}
        {item.matk ? <span className="s-matk">+{item.matk} MATK</span> : null}
        {item.mdef ? <span className="s-mdef">+{item.mdef} MDEF</span> : null}
        {item.hp   ? <span className="s-hp">+{item.hp} HP</span> : null}
        {item.mp   ? <span className="s-mp">+{item.mp} MP</span> : null}
      </div>
      {item.class && <div className="item-class">{capitalize(item.class)} only</div>}
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
