import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);

  // SECURITY & FORM STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState(''); 
  const [generatedCode, setGeneratedCode] = useState('');

  // SYNC STATE
  const [localTimestamp, setLocalTimestamp] = useState(0);

  // IDENTIFICATION: Persistent ID for this specific device/browser session
  const [mySessionId] = useState(() => {
    const saved = localStorage.getItem('lounge_session_id');
    if (saved) return saved;
    const newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem('lounge_session_id', newId);
    return newId;
  });

  const fetchLoungeData = async () => {
    setLoading(true);
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) {
      const withCounts = await Promise.all(data.map(async (l) => {
        const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true }).eq('lounge_id', l.id);
        return { ...l, participantCount: count || 0 };
      }));
      setLounges(withCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoungeData(); }, []);

  // REAL-TIME SYNC
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase
        .channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
        (payload) => {
          if (payload.new.last_timestamp !== undefined) {
            setLocalTimestamp(payload.new.last_timestamp);
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  // HOST: Create Lounge (Enforcing 1 Lounge Rule)
  const handleCreate = async () => {
    if (!newLoungeName || !newHostName) return alert("Missing fields");

    // 1. CLEAR PREVIOUS HOSTING SESSIONS: Remove any lounge previously hosted by this device
    await supabase.from('active_lounges').delete().eq('host_id', mySessionId);
    
    const uniqueCode = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: mySessionId, // Using the unique device session ID
      entry_code: uniqueCode,
      last_timestamp: 0
    }]).select();

    if (!error && data) {
      setGeneratedCode(uniqueCode);
      setCurrentLounge(data[0]);
      setShowHostModal(false);
      setView('room');
    } else {
      alert("Error: " + error?.message);
    }
  };

  // GUEST: Verify Entry (Enforcing 1 Participation Rule)
  const handleJoinVerify = async () => {
    if (inputCode.trim() === currentLounge.entry_code.toString().trim()) {
      
      // 1. CLEAR PREVIOUS PARTICIPATIONS: Remove this device from any other lounge's participant list
      await supabase.from('participants').delete().eq('peer_id', mySessionId);

      const { error } = await supabase.from('participants').insert([{
        lounge_id: currentLounge.id,
        user_name: guestName || 'Guest',
        peer_id: mySessionId // Using device ID to track this specific participant
      }]);

      if (!error) {
        setShowJoinModal(false);
        setView('room');
      } else {
        alert("Join Error: " + error.message);
      }
    } else {
      alert("Invalid Entry Code!");
    }
  };

  // EXIT LOGIC
  const handleExit = async () => {
    // Clean up database records on exit
    await supabase.from('active_lounges').delete().eq('host_id', mySessionId);
    await supabase.from('participants').delete().eq('peer_id', mySessionId);
    
    setView('lobby');
    fetchLoungeData();
  };

  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Lounge Hub</h1>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', padding: '10px 15px', borderRadius: '8px' }}>+ Host</button>
        </header>

        <div style={{ marginTop: '20px' }}>
          {lounges.map(l => (
            <div key={l.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '10px' }}>
              <h3>{l.lounge_name} 🔒</h3>
              <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }}>Join Session</button>
            </div>
          ))}
        </div>

        {showHostModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Host Lounge</h2>
              <p style={{ fontSize: '12px', color: 'red' }}>Note: Starting a new lounge will close any lounge you are currently hosting.</p>
              <input placeholder="Topic" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box' }} />
              <button onClick={handleCreate} style={{ width: '100%', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px' }}>Start Session</button>
              <button onClick={() => setShowHostModal(false)} style={{ width: '100%', marginTop: '10px', border: 'none', background: 'none' }}>Cancel</button>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Access Code Required</h2>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }} />
              <input placeholder="6-Digit Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '20px' }} />
              <button onClick={handleJoinVerify} style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px' }}>Verify</button>
              <button onClick={() => setShowJoinModal(false)} style={{ width: '100%', marginTop: '10px', border: 'none', background: 'none' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', textAlign: 'center', background: '#f4f4f4' }}>
      <header style={{ padding: '15px', background: '#000', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
        <strong>{currentLounge?.lounge_name} | Code: {generatedCode || currentLounge?.entry_code}</strong>
        <button onClick={handleExit} style={{ background: 'red', color: '#fff', border: 'none', padding: '5px 15px' }}>Exit</button>
      </header>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p>Sync Position:</p>
        <h1 style={{ fontSize: '120px', margin: '20px 0' }}>{localTimestamp}</h1>
        <button onClick={() => {
          const newTime = localTimestamp + 1;
          setLocalTimestamp(newTime);
          supabase.from('active_lounges').update({ last_timestamp: newTime }).eq('id', currentLounge.id).then();
        }} style={{ padding: '15px 30px', fontSize: '18px', background: '#000', color: '#fff', borderRadius: '10px' }}>Next Step</button>
      </div>
    </div>
  );
}
