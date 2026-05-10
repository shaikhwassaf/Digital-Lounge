import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

interface Bookmark {
  id: string;
  lounge_id: string;
  bookmark_number: number;
  timestamp: number;
  created_at: string;
}

interface Question {
  id: string;
  lounge_id: string;
  peer_id: string;
  user_name: string;
  question_text: string;
  bookmark_number: number;
  answered: boolean;
  created_at: string;
}

interface PollResult {
  id: string;
  lounge_id: string;
  bookmark_number: number;
  understanding_percentage: number;
  total_responses: number;
  created_at: string;
}

interface FileShare {
  id: string;
  lounge_id: string;
  from_peer_id: string;
  from_name: string;
  to_peer_id: string | null; // null = all participants
  file_name: string;
  file_url: string;
  created_at: string;
}

interface ClassSession {
  id: string;
  lounge_id: string;
  status: 'active' | 'on_break' | 'ended';
  current_bookmark: number;
  started_at: string;
  last_updated: string;
}

export default function App() {
  const [lounges, setLounges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);

  // FORM STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  // BOOKMARK & QUESTIONS STATES
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentBookmarkNumber, setCurrentBookmarkNumber] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [questionText, setQuestionText] = useState('');
  const [showQuestionModal, setShowQuestionModal] = useState(false);

  // POLL STATES
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollResults, setPollResults] = useState<PollResult | null>(null);
  const [understanding, setUnderstanding] = useState<'yes' | 'no' | null>(null);
  const [hasVotedInPoll, setHasVotedInPoll] = useState(false);

  // FILE SHARING STATES
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileShareMode, setFileShareMode] = useState<'all' | 'single' | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);

  // CLASS SESSION STATES
  const [classSession, setClassSession] = useState<ClassSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // SESSION ID
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

  // FETCH LOUNGES
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

  // FETCH BOOKMARKS FOR CURRENT LOUNGE
  const fetchBookmarks = async (loungeId: string) => {
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('lounge_id', loungeId)
      .order('bookmark_number', { ascending: true });
    if (data) {
      setBookmarks(data);
      if (data.length > 0) {
        setCurrentBookmarkNumber(data[data.length - 1].bookmark_number);
      }
    }
  };

  // FETCH QUESTIONS
  const fetchQuestions = async (loungeId: string, bookmarkNumber: number) => {
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('lounge_id', loungeId)
      .eq('bookmark_number', bookmarkNumber)
      .order('created_at', { ascending: true });
    if (data) {
      setQuestions(data);
      const unanswered = data.filter(q => !q.answered).length;
      setUnansweredCount(unanswered);
    }
  };

  // FETCH PARTICIPANTS
  const fetchParticipants = async (loungeId: string) => {
    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('lounge_id', loungeId);
    if (data) {
      setParticipants(data);
    }
  };

  // FETCH SHARED FILES
  const fetchSharedFiles = async (loungeId: string) => {
    const { data } = await supabase
      .from('file_shares')
      .select('*')
      .eq('lounge_id', loungeId)
      .order('created_at', { ascending: false });
    if (data) {
      setSharedFiles(data);
    }
  };

  // FETCH CLASS SESSION
  const fetchClassSession = async (loungeId: string) => {
    const { data } = await supabase
      .from('class_sessions')
      .select('*')
      .eq('lounge_id', loungeId)
      .single();
    if (data) {
      setClassSession(data);
      setSessionStatus(data.status);
    }
  };

  useEffect(() => {
    fetchLoungeData();
  }, []);

  // REAL-TIME SYNC WHEN IN ROOM
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      fetchBookmarks(currentLounge.id);
      fetchQuestions(currentLounge.id, currentBookmarkNumber);
      fetchParticipants(currentLounge.id);
      fetchSharedFiles(currentLounge.id);
      fetchClassSession(currentLounge.id);

      const bookmarkChannel = supabase
        .channel(`lounge-bookmarks-${currentLounge.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookmarks', filter: `lounge_id=eq.${currentLounge.id}` }, () => {
          fetchBookmarks(currentLounge.id);
        })
        .subscribe();

      const questionChannel = supabase
        .channel(`lounge-questions-${currentLounge.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions', filter: `lounge_id=eq.${currentLounge.id}` }, () => {
          fetchQuestions(currentLounge.id, currentBookmarkNumber);
        })
        .subscribe();

      const fileChannel = supabase
        .channel(`lounge-files-${currentLounge.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'file_shares', filter: `lounge_id=eq.${currentLounge.id}` }, () => {
          fetchSharedFiles(currentLounge.id);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(bookmarkChannel);
        supabase.removeChannel(questionChannel);
        supabase.removeChannel(fileChannel);
      };
    }
  }, [view, currentLounge, currentBookmarkNumber]);

  // HOST: Create Lounge
  const handleCreate = async () => {
    if (!newLoungeName || !newHostName) return alert('Missing fields');

    await supabase.from('active_lounges').delete().eq('host_id', mySessionId);

    const uniqueCode = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await supabase.from('active_lounges').insert([{
      lounge_name: newLoungeName,
      host_name: newHostName,
      host_id: mySessionId,
      entry_code: uniqueCode,
      last_timestamp: 0
    }]).select();

    if (!error && data) {
      setGeneratedCode(uniqueCode);
      setCurrentLounge(data[0]);
      setIsHost(true);
      setShowHostModal(false);
      setView('room');
    } else {
      alert('Error: ' + error?.message);
    }
  };

  // GUEST: Verify Entry
  const handleJoinVerify = async () => {
    if (inputCode.trim() === currentLounge.entry_code.toString().trim()) {
      await supabase.from('participants').delete().eq('peer_id', mySessionId);

      const { error } = await supabase.from('participants').insert([{
        lounge_id: currentLounge.id,
        user_name: guestName || 'Guest',
        peer_id: mySessionId
      }]);

      if (!error) {
        setShowJoinModal(false);
        setView('room');
      } else {
        alert('Join Error: ' + error.message);
      }
    } else {
      alert('Invalid Entry Code!');
    }
  };

  // START CLASS
  const handleStartClass = async () => {
    const { error } = await supabase.from('class_sessions').insert([{
      lounge_id: currentLounge.id,
      status: 'active',
      current_bookmark: 0,
      started_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    }]);

    if (!error) {
      setSessionStatus('active');
      fetchClassSession(currentLounge.id);
    } else {
      alert('Error starting class: ' + error.message);
    }
  };

  // ADD BOOKMARK (HOST ONLY)
  const handleAddBookmark = async () => {
    const newBookmarkNumber = currentBookmarkNumber + 1;

    const { error } = await supabase.from('bookmarks').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: newBookmarkNumber,
      timestamp: Date.now(),
      created_at: new Date().toISOString()
    }]);

    if (!error) {
      setCurrentBookmarkNumber(newBookmarkNumber);
      setQuestions([]);
      setUnansweredCount(0);
      setHasVotedInPoll(false);
      fetchBookmarks(currentLounge.id);
    } else {
      alert('Error adding bookmark: ' + error.message);
    }
  };

  // ADD QUESTION (PARTICIPANT)
  const handleAddQuestion = async () => {
    if (!questionText.trim()) return alert('Question cannot be empty');

    const { error } = await supabase.from('questions').insert([{
      lounge_id: currentLounge.id,
      peer_id: mySessionId,
      user_name: guestName || 'Guest',
      question_text: questionText,
      bookmark_number: currentBookmarkNumber,
      answered: false,
      created_at: new Date().toISOString()
    }]);

    if (!error) {
      setQuestionText('');
      setShowQuestionModal(false);
      fetchQuestions(currentLounge.id, currentBookmarkNumber);
    } else {
      alert('Error adding question: ' + error.message);
    }
  };

  // MARK QUESTION AS ANSWERED (HOST ONLY)
  const handleAnswerQuestion = async (questionId: string) => {
    const { error } = await supabase
      .from('questions')
      .update({ answered: true })
      .eq('id', questionId);

    if (!error) {
      fetchQuestions(currentLounge.id, currentBookmarkNumber);
    } else {
      alert('Error answering question: ' + error.message);
    }
  };

  // SUBMIT POLL RESPONSE
  const handleSubmitPoll = async () => {
    if (!understanding) return alert('Please select an option');

    const { error } = await supabase.from('poll_responses').insert([{
      lounge_id: currentLounge.id,
      bookmark_number: currentBookmarkNumber,
      peer_id: mySessionId,
      understanding: understanding === 'yes',
      created_at: new Date().toISOString()
    }]);

    if (!error) {
      setHasVotedInPoll(true);
      setUnderstanding(null);
      fetchPollResults();
    } else {
      alert('Error submitting poll: ' + error.message);
    }
  };

  // FETCH POLL RESULTS
  const fetchPollResults = async () => {
    const { data } = await supabase
      .from('poll_responses')
      .select('*')
      .eq('lounge_id', currentLounge.id)
      .eq('bookmark_number', currentBookmarkNumber);

    if (data) {
      const yesCount = data.filter(r => r.understanding).length;
      const total = data.length;
      const percentage = total > 0 ? Math.round((yesCount / total) * 100) : 0;

      setPollResults({
        id: 'poll',
        lounge_id: currentLounge.id,
        bookmark_number: currentBookmarkNumber,
        understanding_percentage: percentage,
        total_responses: total,
        created_at: new Date().toISOString()
      });
    }
  };

  // FILE SHARING (HOST)
  const handleShareFile = async (fileName: string, targetPeerId: string | null = null) => {
    const { error } = await supabase.from('file_shares').insert([{
      lounge_id: currentLounge.id,
      from_peer_id: mySessionId,
      from_name: newHostName || 'Host',
      to_peer_id: targetPeerId,
      file_name: fileName,
      file_url: `file://${fileName}`,
      created_at: new Date().toISOString()
    }]);

    if (!error) {
      fetchSharedFiles(currentLounge.id);
      setShowFileModal(false);
      alert('File shared successfully!');
    } else {
      alert('Error sharing file: ' + error.message);
    }
  };

  // FILE SHARING (PARTICIPANT)
  const handleParticipantShareFile = async (fileName: string) => {
    const { error } = await supabase.from('file_shares').insert([{
      lounge_id: currentLounge.id,
      from_peer_id: mySessionId,
      from_name: guestName || 'Guest',
      to_peer_id: currentLounge.host_id,
      file_name: fileName,
      file_url: `file://${fileName}`,
      created_at: new Date().toISOString()
    }]);

    if (!error) {
      fetchSharedFiles(currentLounge.id);
      alert('File shared with teacher!');
    } else {
      alert('Error sharing file: ' + error.message);
    }
  };

  // BREAK CLASS
  const handleBreak = async () => {
    const { error } = await supabase
      .from('class_sessions')
      .update({ status: 'on_break', last_updated: new Date().toISOString() })
      .eq('lounge_id', currentLounge.id);

    if (!error) {
      setSessionStatus('on_break');
    } else {
      alert('Error: ' + error.message);
    }
  };

  // RESUME CLASS
  const handleResume = async () => {
    const { error } = await supabase
      .from('class_sessions')
      .update({ status: 'active', last_updated: new Date().toISOString() })
      .eq('lounge_id', currentLounge.id);

    if (!error) {
      setSessionStatus('active');
    } else {
      alert('Error: ' + error.message);
    }
  };

  // END CLASS
  const handleEndClass = async () => {
    const { error } = await supabase
      .from('class_sessions')
      .update({ status: 'ended', last_updated: new Date().toISOString() })
      .eq('lounge_id', currentLounge.id);

    if (!error) {
      handleExit();
    } else {
      alert('Error: ' + error.message);
    }
  };

  // EXIT LOGIC
  const handleExit = async () => {
    await supabase.from('active_lounges').delete().eq('host_id', mySessionId);
    await supabase.from('participants').delete().eq('peer_id', mySessionId);

    setView('lobby');
    setIsHost(false);
    fetchLoungeData();
  };

  // ===== LOBBY VIEW =====
  if (view === 'lobby') {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>🎓 Digital Lounge</h1>
          <button onClick={() => setShowHostModal(true)} style={{ background: '#000', color: '#fff', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer' }}>+ Host</button>
        </header>

        <div style={{ marginTop: '20px' }}>
          {loading ? <p>Loading lounges...</p> : lounges.length === 0 ? <p>No active sessions. Start one!</p> : lounges.map(l => (
            <div key={l.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '10px' }}>
              <h3>{l.lounge_name} 🔒</h3>
              <p>Host: {l.host_name} | Participants: {l.participantCount}</p>
              <button onClick={() => { setCurrentLounge(l); setShowJoinModal(true); }} style={{ background: '#007bff', color: '#fff', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>Join Session</button>
            </div>
          ))}
        </div>

        {/* HOST MODAL */}
        {showHostModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Host New Session</h2>
              <input placeholder="Session Topic" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <button onClick={handleCreate} style={{ width: '100%', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px' }}>Start Session</button>
              <button onClick={() => setShowHostModal(false)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* JOIN MODAL */}
        {showJoinModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '300px' }}>
              <h2>Join Session</h2>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="6-Digit Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', textAlign: 'center', fontSize: '20px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <button onClick={handleJoinVerify} style={{ width: '100%', padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px' }}>Verify</button>
              <button onClick={() => setShowJoinModal(false)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== ROOM VIEW =====
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f4f4f4' }}>
      {/* HEADER */}
      <header style={{ padding: '15px 20px', background: '#000', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{currentLounge?.lounge_name}</strong> | Code: {generatedCode || currentLounge?.entry_code}
          {isHost && <span style={{ marginLeft: '15px', background: '#28a745', padding: '5px 10px', borderRadius: '5px', fontSize: '12px' }}>HOST</span>}
        </div>
        <div>
          {isHost && (
            <>
              {sessionStatus === 'not_started' && (
                <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Start Class</button>
              )}
              {sessionStatus === 'active' && (
                <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Break</button>
              )}
              {sessionStatus === 'on_break' && (
                <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Resume</button>
              )}
              <button onClick={handleEndClass} style={{ background: '#f44336', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>End Class</button>
            </>
          )}
          <button onClick={handleExit} style={{ background: '#d32f2f', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>Exit</button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT SECTION - BOOKMARK & QUESTIONS */}
        <div style={{ flex: 2, padding: '20px', overflowY: 'auto', borderRight: '1px solid #ddd' }}>
          <h2>📌 Bookmark #{currentBookmarkNumber}</h2>

          {/* HOST CONTROLS */}
          {isHost && (
            <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
              <h3>Host Controls</h3>
              <p>❓ Unanswered Questions: <strong style={{ color: unansweredCount > 0 ? 'red' : 'green' }}>{unansweredCount}</strong></p>
              
              {unansweredCount > 0 ? (
                <p style={{ color: 'red', fontSize: '12px' }}>⚠️ Answer all questions before running poll</p>
              ) : (
                <>
                  <button onClick={() => { setShowPollModal(true); fetchPollResults(); }} style={{ background: '#2196f3', color: '#fff', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px' }}>Run Poll</button>
                  {pollResults && pollResults.understanding_percentage >= 80 ? (
                    <button onClick={handleAddBookmark} style={{ background: '#28a745', color: '#fff', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginBottom: '10px' }}>➕ Next Bookmark</button>
                  ) : (
                    <button disabled style={{ background: '#ccc', color: '#666', padding: '10px 15px', borderRadius: '5px', cursor: 'not-allowed', marginBottom: '10px' }}>➕ Next Bookmark (Need 80% understanding)</button>
                  )}
                </>
              )}

              <button onClick={() => setShowFileModal(true)} style={{ background: '#ff9800', color: '#fff', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginRight: '10px', marginBottom: '10px' }}>📂 Share File</button>
            </div>
          )}

          {/* QUESTIONS SECTION */}
          <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>❓ Questions ({questions.length})</h3>
              {!isHost && sessionStatus === 'active' && (
                <button onClick={() => setShowQuestionModal(true)} style={{ background: '#4caf50', color: '#fff', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>+ Ask Question</button>
              )}
            </div>

            {questions.length === 0 ? (
              <p style={{ color: '#999' }}>No questions yet</p>
            ) : (
              <div>
                {questions.map(q => (
                  <div key={q.id} style={{ background: q.answered ? '#f1f1f1' : '#fff3cd', padding: '10px', borderRadius: '5px', marginBottom: '10px', borderLeft: `4px solid ${q.answered ? '#ccc' : '#ff9800'}` }}>
                    <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{q.user_name}</p>
                    <p style={{ margin: '0 0 10px 0' }}>{q.question_text}</p>
                    {isHost && !q.answered && (
                      <button onClick={() => handleAnswerQuestion(q.id)} style={{ background: '#4caf50', color: '#fff', padding: '5px 10px', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>Mark Answered</button>
                    )}
                    {q.answered && <span style={{ color: '#4caf50', fontSize: '12px' }}>✓ Answered</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SHARED FILES SECTION */}
          <div style={{ background: '#fff', padding: '15px', borderRadius: '10px' }}>
            <h3>📁 Shared Files ({sharedFiles.length})</h3>
            {sharedFiles.length === 0 ? (
              <p style={{ color: '#999' }}>No files shared yet</p>
            ) : (
              <div>
                {sharedFiles.map(f => (
                  <div key={f.id} style={{ background: '#f5f5f5', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
                    <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>📄 {f.file_name}</p>
                    <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>From: {f.from_name} {f.to_peer_id ? '(Private)' : '(All)'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SECTION - POLL & SYNC */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', textAlign: 'center' }}>
          <h2>📊 Poll Status</h2>
          {pollResults ? (
            <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
              <h3>Understanding Level</h3>
              <div style={{ fontSize: '48px', fontWeight: 'bold', color: pollResults.understanding_percentage >= 80 ? '#4caf50' : '#ff9800', marginBottom: '10px' }}>
                {pollResults.understanding_percentage}%
              </div>
              <p>{pollResults.total_responses} students responded</p>
              {pollResults.understanding_percentage >= 80 && (
                <p style={{ color: '#4caf50', fontWeight: 'bold' }}>✓ Ready to proceed!</p>
              )}
            </div>
          ) : (
            <p style={{ color: '#999' }}>No poll data yet</p>
          )}

          {/* PARTICIPANT POLL VOTING */}
          {!isHost && sessionStatus === 'active' && !hasVotedInPoll && (
            <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
              <h4>Do you understand this section?</h4>
              <div style={{ marginBottom: '10px' }}>
                <button 
                  onClick={() => setUnderstanding('yes')}
                  style={{ background: understanding === 'yes' ? '#4caf50' : '#ddd', color: understanding === 'yes' ? '#fff' : '#000', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', marginRight: '10px', border: 'none', fontWeight: 'bold' }}
                >
                  ✓ Yes
                </button>
                <button 
                  onClick={() => setUnderstanding('no')}
                  style={{ background: understanding === 'no' ? '#f44336' : '#ddd', color: understanding === 'no' ? '#fff' : '#000', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
                >
                  ✗ No
                </button>
              </div>
              <button onClick={handleSubmitPoll} style={{ background: '#2196f3', color: '#fff', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', width: '100%', border: 'none', fontWeight: 'bold' }}>Submit Response</button>
            </div>
          )}

          {hasVotedInPoll && !isHost && (
            <p style={{ color: '#4caf50', fontWeight: 'bold' }}>✓ Your response submitted</p>
          )}

          {/* PARTICIPANT FILE SHARING */}
          {!isHost && sessionStatus === 'active' && (
            <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px', marginTop: '20px' }}>
              <h4>Share with Teacher</h4>
              <button 
                onClick={() => handleParticipantShareFile('document.pdf')}
                style={{ background: '#ff9800', color: '#fff', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', width: '100%', border: 'none', fontWeight: 'bold' }}
              >
                📤 Share File
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}

      {/* ADD QUESTION MODAL */}
      {showQuestionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h2>Ask a Question</h2>
            <textarea 
              placeholder="Type your question..." 
              value={questionText} 
              onChange={e => setQuestionText(e.target.value)}
              style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box', minHeight: '100px', fontFamily: 'sans-serif' }}
            />
            <button onClick={handleAddQuestion} style={{ width: '100%', padding: '12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' }}>Send Question</button>
            <button onClick={() => setShowQuestionModal(false)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* FILE SHARING MODAL */}
      {showFileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h2>Share File</h2>
            {!fileShareMode ? (
              <div>
                <button 
                  onClick={() => setFileShareMode('all')}
                  style={{ width: '100%', padding: '12px', background: '#2196f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' }}
                >
                  📢 Share with All Participants
                </button>
                <button 
                  onClick={() => setFileShareMode('single')}
                  style={{ width: '100%', padding: '12px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' }}
                >
                  👤 Share with Specific Participant
                </button>
                <button onClick={() => setShowFileModal(false)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : fileShareMode === 'all' ? (
              <div>
                <button 
                  onClick={() => handleShareFile('assignment.pdf')}
                  style={{ width: '100%', padding: '12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' }}
                >
                  📤 Share assignment.pdf
                </button>
                <button onClick={() => setFileShareMode(null)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back</button>
              </div>
            ) : (
              <div>
                <p style={{ marginBottom: '10px' }}>Select participant:</p>
                {participants.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => { handleShareFile('assignment.pdf', p.peer_id); setFileShareMode(null); }}
                    style={{ width: '100%', padding: '12px', background: '#9c27b0', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' }}
                  >
                    {p.user_name}
                  </button>
                ))}
                <button onClick={() => setFileShareMode(null)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* POLL MODAL */}
      {showPollModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '400px' }}>
            <h2>Poll Results</h2>
            {pollResults ? (
              <div>
                <h3 style={{ fontSize: '36px', color: pollResults.understanding_percentage >= 80 ? '#4caf50' : '#ff9800', marginBottom: '10px' }}>
                  {pollResults.understanding_percentage}%
                </h3>
                <p>Students who understand: {pollResults.total_responses}</p>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
                  {pollResults.understanding_percentage >= 80 ? '✓ Ready to proceed' : '⚠️ Need more clarification'}
                </p>
              </div>
            ) : (
              <p>Loading poll results...</p>
            )}
            <button onClick={() => setShowPollModal(false)} style={{ width: '100%', padding: '12px', border: '1px solid #ccc', background: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
