import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  // NAVIGATION & VIEW STATE
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // FORM & MODAL STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');

  // LEARNING GATE STATES
  const [syncPosition, setSyncPosition] = useState('00:00');
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [pollActive, setPollActive] = useState(false);
  const [pollResults, setPollResults] = useState({ yes: 0, total: 0 });

  // 1-USER-1-SESSION FINGERPRINT
  const [myId] = useState(() => {
    const id = localStorage.getItem('user_uuid') || crypto.randomUUID();
    localStorage.setItem('user_uuid', id);
    return id;
  });

  useEffect(() => { fetchLounges(); }, []);

  const fetchLounges = async () => {
    setLoading(true);
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) setLounges(data);
    setLoading(false);
  };

  // REAL-TIME SYNC ENGINE
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
          (payload: any) => {
            const updated = payload.new;
            setSyncPosition(updated.last_timestamp);
            setPollActive(updated.poll_active);
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `lounge_id=eq.${currentLounge.id}` }, 
          () => fetchRoomData())
        .subscribe();

      fetchRoomData(); // Initial load
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  const fetchRoomData = async () => {
    if (!currentLounge) return;
    const { data: qData } = await supabase.from('participants').select('*').eq('lounge_id', currentLounge.id).not('question_text', 'is', null);
    const { data: pData } = await supabase.from('participants').select('poll_response').eq('lounge_id', currentLounge.id).not('poll_response', 'is', null);
    
    if (qData) setQuestions(qData);
    if (pData) {
      const yesCount = pData.filter(r => r.poll_response === 'YES').length;
      setPollResults({ yes: yesCount, total: pData.length });
    }
  };

  // TEACHER: START SESSION
  const handleHostCreate = async () => {
    if (!newLoungeName || !newHostName) return alert("Fill all fields");
    
    // Cleanup previous sessions
    await supabase.from('active_lounges').delete().eq('host_id', myId);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: myId,
      entry_code: code,
      last_timestamp: '00:00'
    }]).select();

    if (!error && data) {
      setCurrentLounge(data[0]);
      setIsHost(true);
      setView('room');
      setShowHostModal(false);
    }
  };

  // STUDENT: JOIN SESSION
  const handleJoinVerify = async () => {
    if (inputCode.trim() === currentLounge.entry_code.toString().trim()) {
      await supabase.from('participants').delete().eq('peer_id', myId);
      const { error } = await supabase.from('participants').insert([{
        lounge_id: currentLounge.id,
        user_name: guestName || 'Student',
        peer_id: myId
      }]);

      if (!error) {
        setIsHost(false);
        setView('room');
        setShowJoinModal(false);
      }
    } else {
      alert("Invalid Code");
    }
  };

  // --- ROOM LOGIC ---
  const score = pollResults.total > 0 ? Math.round((pollResults.yes / pollResults.total) * 100) : 0;

  const affixBookMark = async () => {
    if (questions.length > 0) return alert("Answer all questions first!");
    if (score <= 80 && pollActive) return alert("Understanding score must be > 80% to proceed.");

    const time = prompt("Affix Book Mark (Time Format e.g., 10:20):");
    if (time) {
      await supabase.from('participants').update({ question_text: null, poll_response: null }).eq('lounge_id', currentLounge.id);
      await supabase.from('active_lounges').update({ last_timestamp: time, poll_active: false }).eq('id', currentLounge.id);
      setPollResults({ yes: 0, total: 0 });
    }
  };

  // EXIT
  const handleExit = async () => {
    if (isHost) await supabase.from('active_lounges').delete().eq('host_id', myId);
    else await supabase.from('participants').delete().eq('peer_id', myId);
    setView('lobby');
    setCurrentLounge(null);
    fetchLounges();
  };

  // LOBBY RENDERING
  if (view === 'lobby') {
    return (
      <div style={{ padding: '30px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
          <h2>Digital Lounge</h2>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '5px' }}>Host Session</button>
        </header>

        <div style={{ marginTop: '20px' }}>
          {loading ? <p>Loading...</p> : lounges.map(l => (
            <div key={l.id} style={{ padding: '15px', border: '1px solid #ddd', borderRadius: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{l.lounge_name} (Host: {l.host_name})</span>
              <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }}>Join</button>
            </div>
          ))}
        </div>

        {showHostModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '300px' }}>
              <h3>Setup Your Lounge</h3>
              <input placeholder="Lounge Name" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
              <input placeholder="Teacher Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '10px' }} />
              <button onClick={handleHostCreate} style={{ width: '100%', padding: '10px', background: '#28a745', color: '#fff', border: 'none' }}>Go Live</button>
              <button onClick={() => setShowHostModal(false)} style={{ width: '100%', marginTop: '5px', border: 'none', background: 'none' }}>Cancel</button>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '300px' }}>
              <h3>Enter 6-Digit Code</h3>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px' }} />
              <input placeholder="Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '10px', textAlign: 'center', fontSize: '20px' }} />
              <button onClick={handleJoinVerify} style={{ width: '100%', padding: '10px', background: '#007bff', color: '#fff', border: 'none' }}>Enter</button>
              <button onClick={() => setShowJoinModal(false)} style={{ width: '100%', marginTop: '5px', border: 'none', background: 'none' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ROOM RENDERING (TEACHER & STUDENT)
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ flex: 2, background: '#f0f2f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <button onClick={handleExit} style={{ position: 'absolute', top: 20, right: 20, background: 'red', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px' }}>Exit Room</button>
        
        <p style={{ color: '#666', letterSpacing: '2px' }}>BOOK MARK</p>
        <h1 style={{ fontSize: '150px', margin: 0 }}>{syncPosition}</h1>

        <div style={{ marginTop: '30px' }}>
          {isHost ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => supabase.from('active_lounges').update({ poll_active: true }).eq('id', currentLounge.id)} style={{ padding: '15px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px' }}>Start Poll</button>
              <button onClick={affixBookMark} style={{ padding: '15px', background: (score > 80 && !pollActive) ? '#28a745' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px' }}>Next Book Mark</button>
            </div>
          ) : (
            pollActive && (
              <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                <h3>Understand this section?</h3>
                <button onClick={() => { supabase.from('participants').update({ poll_response: 'YES' }).eq('peer_id', myId); alert("Voted Yes"); }} style={{ padding: '10px 20px', background: '#28a745', color: '#fff', marginRight: '10px' }}>Yes</button>
                <button onClick={() => { supabase.from('participants').update({ poll_response: 'NO' }).eq('peer_id', myId); alert("Voted No"); }} style={{ padding: '10px 20px', background: '#dc3545', color: '#fff' }}>No</button>
              </div>
            )
          )}
        </div>
      </div>

      <div style={{ flex: 1, borderLeft: '1px solid #ddd', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h3>Insight: {score}%</h3>
          <div style={{ height: '10px', background: '#eee', borderRadius: '5px' }}>
            <div style={{ width: `${score}%`, height: '100%', background: score > 80 ? '#28a745' : '#ffc107', borderRadius: '5px' }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <h4>Questions ({questions.length})</h4>
          {questions.map(q => (
            <div key={q.id} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
              <p style={{ margin: 0 }}>{q.question_text}</p>
              {isHost && <button onClick={() => supabase.from('participants').update({ question_text: null }).eq('id', q.id)} style={{ color: 'blue', border: 'none', background: 'none', fontSize: '12px' }}>Mark Answered</button>}
            </div>
          ))}
        </div>
        {!isHost && (
          <div style={{ padding: '20px', display: 'flex', gap: '5px' }}>
            <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Ask teacher..." style={{ flex: 1, padding: '10px' }} />
            <button onClick={() => { supabase.from('participants').update({ question_text: newQuestion }).eq('peer_id', myId); setNewQuestion(''); }} style={{ background: '#000', color: '#fff', padding: '10px' }}>Send</button>
          </div>
        )}
      </div>
    </div>
  );
}
