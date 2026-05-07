import { useEffect, useRef, useState } from 'react';

export default function Chat({ log, onSend }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) onSend(text.trim());
    setText('');
    setOpen(false);
  };

  return (
    <div className="chat-panel">
      <div className="chat-log" ref={logRef}>
        {log.map((m, i) => (
          <div key={i} className={`chat-msg ${m.system ? 'sys' : ''}`}>
            {!m.system && <span className="chat-from">{m.from}:</span>}
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {open ? (
        <form onSubmit={submit} className="chat-input-row">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => setOpen(false)}
            placeholder="Speak…"
            maxLength={200}
          />
        </form>
      ) : (
        <div className="chat-hint">Press <kbd>Enter</kbd> to chat</div>
      )}
    </div>
  );
}
