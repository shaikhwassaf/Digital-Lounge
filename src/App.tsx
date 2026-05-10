import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

// --- Interfaces ---
interface Bookmark { id: string; bookmark_number: number; timestamp: number; }
interface Question { id: string; user_name: string; question_text: string; answered: boolean; }
interface FileShare { id: string; from_name: string; file_name: string; to_peer_id: string | null; }

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);

  // LOBBY & SESSION STATES
  const [lounges, setLounges] = useState<any[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');

  // SYNC & GATE STATES
  const [currentBookmarkNumber, setCurrentBookmarkNumber] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [pollResults, setPollResults] = useState({ percentage: 0, total: 0 });
  const [hasVoted, setHasVoted] = useState(false);

  // UI MODALS
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);

  const [myId] = useState(() => {
    const id = localStorage.getItem('lounge_session_id') || crypto.randomUUID();
    localStorage.setItem('lounge_session_id', id);
    return id;
  });

  // 1. DATA FETCHING
  const fetchData = async () => {
    if (!currentLounge) return;
    
    // Fetch Questions for current bookmark
    const { data: qData } = await supabase.from('questions')
      .select('*').eq('lounge_id', currentLounge.id).eq('bookmark_number', currentBookmarkNumber);
    if (qData) {
      setQuestions(qData);
      setUnansweredCount(qData.filter(q => !q.answered).length);
    }

    // Fetch Poll Results
    const { data: pData } = await supabase.from('poll_responses')
      .select('understanding').eq('lounge_id', currentLounge.id).eq('bookmark_number', currentBookmarkNumber);
    if (pData && pData.length > 0) {
      const yes = pData.filter(r => r.understanding).length;
      setPollResults({ percentage: Math.round((yes / pData.length) * 100), total: pData.length });
    } else {
      setPollResults({ percentage: 0, total: 0 });
    }

    // Fetch Files
    const { data: fData } = await supabase.from('file_shares').select('*').eq('lounge_id', currentLounge.id);
    if (fData) setSharedFiles(fData);
  };

  // 2. REAL-TIME SUBSCRIPTION
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`sync-${currentLounge.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, fetchData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_responses' }, fetchData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks' }, (p) => setCurrentBookmarkNumber(p.new.bookmark_number))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'class_sessions' }, (p) => setSessionStatus(p.new.status))
        .subscribe();
      fetchData();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge, currentBookmarkNumber]);

  // 3. ACTIONS
  const handleAddQuestion = async () => {
    if (!questionText.trim()) return;
    await supabase.from('questions').insert([{
      lounge_id: currentLounge.id,
      peer_id: myId,
      user_name: guestName || 'Student',
      question_text: questionText,
      bookmark_number: currentBookmarkNumber,
      answered: false
    }]);
    setQuestionText('');
    setShowQuestionModal(false);
  };

  const handleNextBookmark = async () => {
    if (unansweredCount > 0) return alert(`Resolve all questions first!`);
    if (pollResults.percentage < 80) return alert(`Understanding is only ${pollResults.percentage}%. You need 80% to proceed.`);

    const nextNum = currentBookmarkNumber + 1;
    await supabase.from('bookmarks').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: nextNum,
      timestamp: Date.now()
    }]);
    setHasVoted(false);
  };

  const submitVote = async (val: boolean) => {
    await supabase.from('poll_responses').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: currentBookmarkNumber,
      peer_id: myId,
      understanding: val
    }]);
    setHasVoted(true);
  };

  // --- LOBBY VIEW ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>🎓 Digital Learning Lounge</h1>
        <button onClick={() => setShowHostModal(true)} style={{ padding: '15px 30px', background: 'black', color: 'white', borderRadius: '8px' }}>Host Class</button>
        {/* ... Logic to join existing lounges ... */}
        {showHostModal && (
           <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <div style={{ background: 'white', padding: '30px', borderRadius: '12px' }}>
                <input placeholder="Class Name" onChange={e => setNewLoungeName(e.target.value)} style={{ display: 'block', marginBottom: '10px' }} />
                <button onClick={async () => {
                  const code = Math.floor(100000 + Math.random() * 900000).toString();
                  const { data } = await supabase.from('active_lounges').insert([{ lounge_name: newLoungeName, host_id: myId, entry_code: code }]).select();
                  if (data) { setCurrentLounge(data[0]); setIsHost(true); setView('room'); }
                }}>Create Class</button>
             </div>
           </div>
        )}
      </div>
    );
  }

  // --- ROOM VIEW ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <header style={{ background: '#000', color: '#fff', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{currentLounge?.lounge_name} | Bookmark: #{currentBookmarkNumber}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {isHost && (
            <>
              <button onClick={() => setSessionStatus('on_break')} style={{ background: 'orange', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '5px' }}>Break</button>
              <button onClick={() => setView('lobby')} style={{ background: 'red', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '5px' }}>End Class</button>
            </>
          )}
          <button onClick={() => setView('lobby')} style={{ background: '#555', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '5px' }}>Exit</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT: TEACHER CONTROLS & CONTENT */}
        <div style={{ flex: 2, padding: '30px', background: '#f9f9f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '120px', margin: 0 }}>#{currentBookmarkNumber}</h1>
          <p style={{ color: '#888', letterSpacing: '2px' }}>SYNC POSITION</p>

          <div style={{ marginTop: '40px', textAlign: 'center' }}>
            {isHost ? (
              <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                <h3>Academic Gate</h3>
                <p>Questions Pending: <strong style={{ color: unansweredCount > 0 ? 'red' : 'green' }}>{unansweredCount}</strong></p>
                <p>Poll Score: <strong style={{ color: pollResults.percentage >= 80 ? 'green' : 'orange' }}>{pollResults.percentage}%</strong></p>
                <button 
                  onClick={handleNextBookmark}
                  style={{ padding: '12px 25px', background: (unansweredCount === 0 && pollResults.percentage >= 80) ? 'green' : '#ccc', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Affix Next Bookmark
                </button>
              </div>
            ) : (
              !hasVoted && (
                <div style={{ background: '#e3f2fd', padding: '20px', borderRadius: '15px' }}>
                  <h3>Check for Understanding</h3>
                  <button onClick={() => submitVote(true)} style={{ background: 'green', color: 'white', padding: '10px 20px', marginRight: '10px' }}>I Understand</button>
                  <button onClick={() => submitVote(false)} style={{ background: 'red', color: 'white', padding: '10px 20px' }}>I'm Confused</button>
                </div>
              )
            )}
          </div>
        </div>

        {/* RIGHT: STUDENT TOOLS & QUESTIONS */}
        <div style={{ flex: 1, background: 'white', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          
          {/* THE QUESTION ASKING TOOL (For Students) */}
          {!isHost && (
            <div style={{ padding: '20px', background: '#fff3cd', borderBottom: '2px solid #ff9800' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>🎯 Student Tools</h3>
              <button 
                onClick={() => setShowQuestionModal(true)}
                style={{ width: '100%', padding: '15px', background: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ❓ Ask a Question
              </button>
            </div>
          )}

          {/* QUESTION BOARD (Syncs to Teacher) */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            <h3>Question Board ({questions.length})</h3>
            {questions.map(q => (
              <div key={q.id} style={{ padding: '12px', background: q.answered ? '#f1f1f1' : '#fff9e6', borderRadius: '8px', marginBottom: '10px', borderLeft: `5px solid ${q.answered ? '#ccc' : '#ff9800'}` }}>
                <small><strong>{q.user_name}</strong></small>
                <p style={{ margin: '5px 0' }}>{q.question_text}</p>
                {isHost && !q.answered && (
                  <button onClick={() => supabase.from('questions').update({ answered: true }).eq('id', q.id)} style={{ fontSize: '11px', color: 'blue', background: 'none', border: 'none', cursor: 'pointer' }}>Mark Answered</button>
                )}
                {q.answered && <small style={{ color: 'green' }}>✓ Resolved</small>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* QUESTION MODAL */}
      {showQuestionModal && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h2>Ask Your Question</h2>
            <textarea 
              style={{ width: '100%', height: '100px', padding: '10px', boxSizing: 'border-box' }}
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              placeholder="What don't you understand?"
            />
            <button onClick={handleAddQuestion} style={{ width: '100%', padding: '12px', background: '#ff9800', color: 'white', border: 'none', marginTop: '10px' }}>Send to Teacher</button>
            <button onClick={() => setShowQuestionModal(false)} style={{ width: '100%', background: 'none', border: 'none', marginTop: '5px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
