import { useState } from 'react';
import { ITEMS } from '../lib/gamedata';

export default function Shop({ self, vitals, onBuy, onClose }) {
  const [tab, setTab] = useState('weapon');
  const [msg, setMsg] = useState('');

  const visible = Object.values(ITEMS).filter(item => {
    if (item.slot !== tab) return false;
    if (item.class && item.class !== self.charClass) return false;
    return true;
  }).sort((a, b) => (a.tier || 0) - (b.tier || 0));

  const buy = async (id) => {
    const r = await onBuy(id);
    if (r?.ok) setMsg(`Purchased ${ITEMS[id].name}.`);
    else setMsg(r?.error || 'Could not buy.');
    setTimeout(() => setMsg(''), 2200);
  };

  const owned = (id) => (self.inventory || []).some(s => s.id === id && s.qty > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal shop" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">The Merchant's Stall</h2>
        <div className="shop-purse">
          Your purse: <strong>{vitals.gold} gold</strong>
        </div>
        <div className="shop-tabs">
          {['weapon', 'armor', 'helmet', 'ring'].map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {capitalize(t)}s
            </button>
          ))}
        </div>
        <div className="shop-list">
          {visible.map(item => (
            <div className={`shop-row tier-${item.tier || 1}`} key={item.id}>
              <div className="shop-item">
                <div className="item-name">{item.name}</div>
                <div className="item-stats">
                  {item.atk  ? <span>+{item.atk} ATK </span> : null}
                  {item.def  ? <span>+{item.def} DEF </span> : null}
                  {item.matk ? <span>+{item.matk} MATK </span> : null}
                  {item.mdef ? <span>+{item.mdef} MDEF </span> : null}
                  {item.hp   ? <span>+{item.hp} HP </span> : null}
                  {item.mp   ? <span>+{item.mp} MP </span> : null}
                </div>
              </div>
              <div className="shop-buy">
                <span className="price">{item.price}g</span>
                <button
                  onClick={() => buy(item.id)}
                  disabled={owned(item.id) || vitals.gold < item.price}
                >
                  {owned(item.id) ? 'Owned' : 'Buy'}
                </button>
              </div>
            </div>
          ))}
        </div>
        {msg && <div className="shop-msg">{msg}</div>}
      </div>
    </div>
  );
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
