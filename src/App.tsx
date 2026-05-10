import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);
  
  // SESSION STATES
  const [syncPosition, setSyncPosition] = useState('00:00'); // The Book Mark
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [isHost, setIsHost] = useState(false);

  // FINGERPRINT FOR 1-USER-1-SESSION
  const [myId] = useState(() => {
    const id = localStorage.getItem('user_uuid') || crypto.randomUUID();
    localStorage.setItem('user_uuid', id);
    return id;
  });

  useEffect(() => { fetchLounges(); }, []);

  const fetchLounges = async () => {
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) setLounges(data);
  };

  // REAL-TIME ENGINE
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`sync-${currentLounge.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
          (p) => setSyncPosition(p.new.last_timestamp))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, 
          () => fetchQuestions()) // Fetch questions when new ones added
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  const fetchQuestions = async () => {
    const { data } = await supabase.from('participants').select('*').eq('lounge_id', currentLounge.id);
    if (data) setQuestions(data.filter(q => q.question_text));
  };

  // HOST: Affix Book Mark (Update Timestamp)
  const affixBookMark = async () => {
    const time = prompt("Enter Time Stamp for this Book Mark (e.g. 12:45):");
    if (!time) return;
    
    // Check if questions are pending (Simple gate)
    if (questions.length > 0) {
      const confirm = window.confirm(`You have ${questions.length} pending questions. Have you completed the poll?`);
      if (!confirm) return;
    }

    const { error } = await supabase.from('active_lounges')
      .update({ last_timestamp: time })
      .eq('id', currentLounge.id);
    
    if (!error) {
      // Clear questions for the next segment
      await supabase.from('participants').delete().eq('lounge_id', currentLounge.id);
      setQuestions([]);
    }
  };

  // STUDENT: Submit Question
  const submitQuestion = async () => {
    if (!newQuestion) return;
    await supabase.from('participants').insert([{
      lounge_id: currentLounge.id,
      user_name: 'Student',
      question_text: newQuestion,
      peer_id: myId
    }]);
    setNewQuestion('');
    fetchQuestions();
  };

  if (view === 'lobby') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>Digital Educational Lounge</h1>
        <button onClick={() => { setIsHost(true); setView('room'); /* Add Create Logic here as per previous versions */ }} 
          style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}>
          Host as Teacher
        </button>
        <div style={{ marginTop: '20px' }}>
          {lounges.map(l => (
            <button key={l.id} onClick={() => { setCurrentLounge(l); setView('room'); }} style={{ display: 'block', margin: '10px auto', padding: '10px' }}>
              Join {l.lounge_name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* LEFT: THE SYNC BOARD */}
      <div style={{ flex: 2, background: '#f4f4f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '2px solid #ddd' }}>
        <p style={{ color: '#666', letterSpacing: '2px' }}>CURRENT BOOK MARK</p>
        <h1 style={{ fontSize: '120px', margin: '20px 0' }}>{syncPosition}</h1>
        {isHost && (
          <button onClick={affixBookMark} style={{ padding: '20px 40px', fontSize: '20px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>
            Affix Next Book Mark
          </button>
        )}
      </div>

      {/* RIGHT: THE QUESTION BOARD */}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h3>Question Board</h3>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
          {questions.length === 0 ? <p style={{ color: '#999' }}>No pending questions.</p> : 
            questions.map((q, i) => (
              <div key={i} style={{ background: '#fff', padding: '10px', marginBottom: '10px', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <strong>Student:</strong> {q.question_text}
              </div>
            ))
          }
        </div>
        
        {!isHost && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Ask a question..." style={{ flex: 1, padding: '10px' }} />
            <button onClick={submitQuestion} style={{ background: '#007bff', color: '#fff', border: 'none', padding: '10px' }}>Ask</button>
          </div>
        )}
        
        {isHost && (
          <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '8px', fontSize: '13px' }}>
            ⚠️ <strong>Teacher Note:</strong> Answer all questions and conduct a poll before moving to the next Book Mark.
          </div>
        )}
      </div>
    </div>
  );
}
