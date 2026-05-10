import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);

  // LEARNING DATA
  const [syncPosition, setSyncPosition] = useState('00:00');
  const [questions, setQuestions] = useState<any[]>([]);
  const [pollActive, setPollActive] = useState(false);
  const [pollResults, setPollResults] = useState<{ yes: number, total: number }>({ yes: 0, total: 0 });

  const [myId] = useState(() => {
    const id = localStorage.getItem('user_uuid') || crypto.randomUUID();
    localStorage.setItem('user_uuid', id);
    return id;
  });

  // REAL-TIME ENGINE
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'active_lounges', filter: `id=eq.${currentLounge.id}` }, 
          (p) => {
            setSyncPosition(p.new.last_timestamp);
            setPollActive(p.new.poll_active);
            if (!p.new.poll_active) setPollResults({ yes: 0, total: 0 });
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => fetchRoomData())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge]);

  const fetchRoomData = async () => {
    const { data: qData } = await supabase.from('participants').select('*').eq('lounge_id', currentLounge.id).not('question_text', 'is', null);
    const { data: pData } = await supabase.from('participants').select('poll_response').eq('lounge_id', currentLounge.id).not('poll_response', 'is', null);
    
    if (qData) setQuestions(qData);
    if (pData) {
      const yesCount = pData.filter(r => r.poll_response === 'YES').length;
      setPollResults({ yes: yesCount, total: pData.length });
    }
  };

  // --- TEACHER ACTIONS ---
  const startPoll = async () => {
    await supabase.from('active_lounges').update({ poll_active: true }).eq('id', currentLounge.id);
  };

  const affixBookMark = async () => {
    const understandingScore = pollResults.total > 0 ? (pollResults.yes / pollResults.total) * 100 : 0;

    if (questions.length > 0) return alert(`Resolve all ${questions.length} questions first!`);
    if (!pollActive && pollResults.total === 0) return alert("You must run a poll first!");
    if (understandingScore <= 80) return alert(`Understanding is only ${understandingScore.toFixed(0)}%. You need > 80% to proceed.`);

    const time = prompt("Enter Next Book Mark (Time Stamp):");
    if (time) {
      // Clear data for next segment
      await supabase.from('participants').delete().eq('lounge_id', currentLounge.id);
      await supabase.from('active_lounges').update({ 
        last_timestamp: time, 
        poll_active: false 
      }).eq('id', currentLounge.id);
      setQuestions([]);
    }
  };

  // --- STUDENT ACTIONS ---
  const submitVote = async (val: 'YES' | 'NO') => {
    await supabase.from('participants').update({ poll_response: val }).eq('peer_id', myId);
    alert("Response Recorded");
  };

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>Educational Digital Lounge</h1>
        <button onClick={() => { setIsHost(true); setView('room'); /* Note: Add DB creation logic here */ }} 
          style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px' }}>
          Host as Teacher
        </button>
      </div>
    );
  }

  const score = pollResults.total > 0 ? Math.round((pollResults.yes / pollResults.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* MAIN SYNC PANEL */}
      <div style={{ flex: 2, background: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ letterSpacing: '3px', color: '#666' }}>BOOK MARK</p>
          <h1 style={{ fontSize: '140px', margin: '10px 0' }}>{syncPosition}</h1>
          
          {isHost && (
            <div style={{ display: 'flex', gap: '15px' }}>
              <button onClick={startPoll} style={{ padding: '15px 25px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px' }}>
                Launch Understanding Poll
              </button>
              <button 
                onClick={affixBookMark} 
                disabled={score <= 80 || questions.length > 0}
                style={{ padding: '15px 25px', background: (score > 80 && questions.length === 0) ? '#28a745' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px' }}
              >
                Affix Next Book Mark
              </button>
            </div>
          )}
        </div>

        {/* POLL OVERLAY FOR STUDENTS */}
        {!isHost && pollActive && (
          <div style={{ position: 'absolute', bottom: '50px', background: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <h3>Do you understand this segment?</h3>
            <button onClick={() => submitVote('YES')} style={{ padding: '10px 20px', background: '#28a745', color: '#fff', marginRight: '10px' }}>Yes, proceed</button>
            <button onClick={() => submitVote('NO')} style={{ padding: '10px 20px', background: '#dc3545', color: '#fff' }}>No, need help</button>
          </div>
        )}
      </div>

      {/* DASHBOARD PANEL */}
      <div style={{ flex: 1, borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h3>Class Insight</h3>
          <div style={{ background: '#eee', height: '25px', borderRadius: '15px', overflow: 'hidden', marginTop: '10px' }}>
            <div style={{ width: `${score}%`, height: '100%', background: score > 80 ? '#28a745' : '#ffc107', transition: '0.5s' }} />
          </div>
          <p style={{ textAlign: 'right', fontSize: '14px', marginTop: '5px' }}>Understanding: {score}%</p>
        </div>

        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <h4>Question Queue ({questions.length})</h4>
          {questions.map((q, i) => (
            <div key={i} style={{ padding: '10px', background: '#fdfdfe', border: '1px solid #eee', marginBottom: '10px', borderRadius: '8px' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>{q.question_text}</p>
              {isHost && <button onClick={async () => {
                await supabase.from('participants').update({ question_text: null }).eq('id', q.id);
                fetchRoomData();
              }} style={{ fontSize: '11px', marginTop: '5px', color: '#007bff', background: 'none', border: 'none', cursor: 'pointer' }}>Mark Answered</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
