import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [guestName, setGuestName] = useState('');

  // SYNC STATE: The local pointer
  const [localTimestamp, setLocalTimestamp] = useState(0);

  // 1. LOBBY DATA
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

  // 2. THE SYNC ENGINE (Real-time listener)
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      // Listen for Host's changes in the active_lounges table
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` },
          (payload) => {
            // Update the local timestamp/page whenever the Host moves
            if (payload.new.last_timestamp !== undefined) {
              setLocalTimestamp(payload.new.last_timestamp);
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  // 3. HOST ACTION: Push new timestamp
  const updateHostProgress = async (newVal: number) => {
    setLocalTimestamp(newVal);
    await supabase
      .from('active_lounges')
      .update({ last_timestamp: newVal })
      .eq('id', currentLounge.id);
  };

  // --- LOBBY VIEW ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#25D366' }}>Digital Lounge Hub</h1>
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '15px' }}>
          {lounges.map(l => (
            <div key={l.id} style={{ borderBottom: '1px solid #ddd', paddingBottom: '15px' }}>
              <h2>{l.lounge_name}</h2>
              <input 
                placeholder="Enter Your Name" 
                value={guestName} 
                onChange={e => setGuestName(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
              />
              <button 
                onClick={() => { setCurrentLounge(l); setView('room'); }} 
                style={{ width: '100%', padding: '12px', background: '#000', color: '#fff' }}
              >
                Join & Sync
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- ROOM VIEW: THE SYNCED WORKSPACE ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#333' }}>
      <header style={{ padding: '15px', background: '#eee', display: 'flex', justifyContent: 'space-between' }}>
        <strong>{currentLounge?.lounge_name}</strong>
        <span>Status: Synced to Page/Time {localTimestamp}</span>
        <button onClick={() => setView('lobby')} style={{ background: 'red', color: '#fff' }}>Exit</button>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ border: '4px solid #000', padding: '40px', borderRadius: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '100px', margin: 0 }}>{localTimestamp}</h1>
          <p>Current Sync Position</p>
          
          {/* HOST CONTROLS (Simulating the local App moving) */}
          <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
            <p style={{ fontSize: '12px', color: '#666' }}>Host Controls (Simulate Local Movement):</p>
            <button onClick={() => updateHostProgress(localTimestamp - 1)} style={{ padding: '10px' }}>Prev</button>
            <button onClick={() => updateHostProgress(localTimestamp + 1)} style={{ padding: '10px', marginLeft: '10px' }}>Next</button>
          </div>
        </div>
        
        <p style={{ marginTop: '20px', width: '80%', textAlign: 'center', color: '#888' }}>
          Participant's local device is now "slaved" to the Host. When the Host moves their file to page <strong>{localTimestamp}</strong>, this screen updates instantly via Supabase Real-time.
        </p>
      </div>
    </div>
  );
}
