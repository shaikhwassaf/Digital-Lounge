import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

// --- Interfaces ---
interface Bookmark { id: string; lounge_id: string; bookmark_number: number; timestamp: number; }
interface Question { id: string; lounge_id: string; peer_id: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; created_at: string; }
interface FileShare { id: string; lounge_id: string; from_name: string; to_peer_id: string | null; file_name: string; file_url: string; }
interface PollResult { understanding_percentage: number; total_responses: number; }

export default function App() {
  // NAVIGATION & ROLE
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lounges, setLounges] = useState<any[]>([]);

  // ROOM STATE
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [pollResults, setPollResults] = useState<PollResult>({ understanding_percentage: 0, total_responses: 0 });
  
  // INPUTS
  const [questionInput, setQuestionInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [inputCode, setInputCode] = useState('');

  const [myId] = useState(() => {
    const id = localStorage.getItem('lounge_session_id') || crypto.randomUUID();
    localStorage.setItem('lounge_session_id', id);
    return id;
  });

  // 1. LOBBY LOGIC
  useEffect(() => {
    fetchLounges();
  }, []);

  const fetchLounges = async () => {
    setLoading(true);
    const { data } = await supabase.from('active_lounges').select('*');
    if (data) setLounges(data);
    setLoading(false);
  };

  // 2. ROOM LOGIC & REAL-TIME
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      const channel = supabase.channel(`room-${currentLounge.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, fetchRoomData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'file_shares' }, fetchRoomData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_responses' }, fetchRoomData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks' }, (p) => setCurrentBookmark(p.new.bookmark_number))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'class_sessions' }, (p) => setSessionStatus(p.new.status))
        .subscribe();
      
      fetchRoomData();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, currentLounge, currentBookmark]);

  async function fetchRoomData() {
    if (!currentLounge) return;

    // Questions for current bookmark
    const { data: qData } = await supabase.from('questions')
      .select('*').eq('lounge_id', currentLounge.id).eq('bookmark_number', currentBookmark);
    if (qData) setQuestions(qData);

    // Poll Results
    const { data: pData } = await supabase.from('poll_responses')
      .select('understanding').eq('lounge_id', currentLounge.id).eq('bookmark_number', currentBookmark);
    if (pData && pData.length > 0) {
      const yes = pData.filter(r => r.understanding).length;
      setPollResults({ understanding_percentage: Math.round((yes / pData.length) * 100), total_responses: pData.length });
    }

    // Files
    const { data: fData } = await supabase.from('file_shares').select('*').eq('lounge_id', currentLounge.id);
    if (fData) setSharedFiles(fData);
  }

  // 3. HANDLERS
  const handleHost = async () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName, host_name: newHostName, host_id: myId, entry_code: code
    }]).select();
    if (data) {
      setCurrentLounge(data[0]);
      setIsHost(true);
      setView('room');
    }
  };

  const handleAskQuestion = async () => {
    if (!questionInput.trim()) return;
    await supabase.from('questions').insert([{
      lounge_id: currentLounge.id,
      peer_id: myId,
      user_name: isHost ? (newHostName || 'Host') : (guestName || 'Student'),
      question_text: questionInput,
      bookmark_number: currentBookmark,
      answered: false
    }]);
    setQuestionInput('');
  };

  const handleFileUpload = async () => {
    const name = prompt("File Name:");
    const url = prompt("Link (URL):");
    if (name && url) {
      await supabase.from('file_shares').insert([{
        lounge_id: currentLounge.id,
        from_name: isHost ? 'Teacher' : (guestName || 'Student'),
        file_name: name,
        file_url: url,
        to_peer_id: isHost ? null : currentLounge.host_id
      }]);
    }
  };

  const handleNextBookmark = async () => {
    const unanswered = questions.filter(q => !q.answered).length;
    if (unanswered > 0) return alert("Resolve all questions before moving forward.");
    if (pollResults.total_responses > 0 && pollResults.understanding_percentage < 80) {
      return alert("Understanding is below 80%. Clarify more before proceeding.");
    }
    
    await supabase.from('bookmarks').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: currentBookmark + 1,
      timestamp: Date.now()
    }]);
  };

  // --- UI RENDER ---

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
        <h1>🎓 Universal Lounge</h1>
        <div style={{ background: '#eee', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
          <h3>Host a New Class</h3>
          <input placeholder="Lounge Name" onChange={e => setNewLoungeName(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '10px' }} />
          <input placeholder="Your Name" onChange={e => setNewHostName(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '10px' }} />
          <button onClick={handleHost} style={{ width: '100%', padding: '10px', background: 'black', color: 'white' }}>Create Room</button>
        </div>
        <div>
          <h3>Join Existing</h3>
          {lounges.map(l => (
            <div key={l.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '5px' }}>
              <strong>{l.lounge_name}</strong> by {l.host_name}
              <button onClick={() => { setCurrentLounge(l); setView('room'); }} style={{ float: 'right' }}>Join</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <header style={{ background: '#000', color: '#fff', padding: '15px 20px', display: 'flex', justifyContent: 'space-between' }}>
        <div><strong>{currentLounge?.lounge_name}</strong> | Code: {currentLounge?.entry_code}</div>
        <button onClick={() => setView('lobby')} style={{ background: 'red', color: 'white', border: 'none', padding: '5px 15px' }}>Exit Room</button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* MAIN INTERACTIVE AREA */}
        <div style={{ flex: 2, background: '#f4f4f4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <p style={{ color: '#666', letterSpacing: '2px' }}>SYNC POSITION</p>
          <h1 style={{ fontSize: '120px', margin: '0' }}>#{currentBookmark}</h1>

          <div style={{ width: '100%', maxWidth: '500px', background: 'white', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', marginTop: '30px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>{isHost ? "Teacher Controls" : "🎯 Student Tools"}</h3>
            
            {isHost ? (
              <div style={{ textAlign: 'center' }}>
                <p>Understanding: <strong style={{ color: pollResults.understanding_percentage >= 80 ? 'green' : 'orange' }}>{pollResults.understanding_percentage}%</strong></p>
                <button 
                  onClick={handleNextBookmark}
                  style={{ width: '100%', padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Move to Next Bookmark
                </button>
              </div>
            ) : (
              <div>
                <textarea 
                  placeholder="Ask a question..." 
                  value={questionInput}
                  onChange={e => setQuestionInput(e.target.value)}
                  style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleAskQuestion} style={{ flex: 1, padding: '12px', background: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>❓ Send Question</button>
                  <button onClick={handleFileUpload} style={{ flex: 1, padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>📤 Share File</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR: CLASS LOGS & QUESTIONS */}
        <div style={{ flex: 1, background: 'white', borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
            <h3>Question Board</h3>
            <small style={{ color: 'red' }}>{questions.filter(q => !q.answered).length} Unresolved</small>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {questions.map((q, i) => (
              <div key={i} style={{ padding: '12px', background: q.answered ? '#f9f9f9' : '#fff3cd', borderRadius: '8px', marginBottom: '10px', borderLeft: `5px solid ${q.answered ? '#ccc' : '#ff9800'}` }}>
                <small><strong>{q.user_name}</strong></small>
                <p style={{ margin: '5px 0' }}>{q.question_text}</p>
                {isHost && !q.answered && (
                  <button onClick={() => supabase.from('questions').update({ answered: true }).eq('id', q.id)} style={{ fontSize: '11px', color: 'blue', border: 'none', background: 'none', cursor: 'pointer', padding: '0' }}>Mark Resolved</button>
                )}
                {q.answered && <small style={{ color: 'green' }}>✓ Resolved</small>}
              </div>
            ))}
          </div>

          <div style={{ padding: '20px', borderTop: '1px solid #eee', background: '#fafafa' }}>
            <h4>Shared Resources</h4>
            {sharedFiles.map((f, i) => (
              <div key={i} style={{ marginBottom: '8px' }}>
                <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#007bff' }}>📄 {f.file_name}</a>
                <br /><small>By: {f.from_name}</small>
              </div>
            ))}
            {isHost && <button onClick={handleFileUpload} style={{ width: '100%', marginTop: '10px', fontSize: '12px' }}>+ Upload File</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
