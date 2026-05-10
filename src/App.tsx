import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// --- Interfaces ---
interface Question { 
  id?: string; 
  user_name: string; 
  question_text: string; 
  bookmark_number: number; 
  answered: boolean; 
}

interface FileShare { 
  file_name: string; 
  file_url: string; 
  from_name: string; 
}

interface PollResult { 
  understanding_percentage: number; 
  total_responses: number; 
}

interface RTCPeerConnectionConfig {
  iceServers: Array<{ urls: string }>;
}

export default function App() {
  // NAVIGATION & ROLE
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);

  // MODAL STATES
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);

  // ROOM STATE
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [pollResults, setPollResults] = useState<PollResult>({ understanding_percentage: 0, total_responses: 0 });
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // WEBRTC STATE
  const pc = useRef<any>(null); // Use any to avoid RTCPeerConnection type issues
  const [sendChannel, setSendChannel] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState('Offline');

  // INPUTS
  const [questionInput, setQuestionInput] = useState('');
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    let id = localStorage.getItem('lounge_session_id');
    if (!id) {
      // Generate UUID v4 compatible string
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('lounge_session_id', id);
    }
    return id;
  });

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    fetchLounges();
  }, []);

  const fetchLounges = async () => {
    try {
      const { data } = await supabase.from('active_lounges').select('*');
      if (data) setLounges(data);
    } catch (error) {
      console.error('Error fetching lounges:', error);
    }
  };

  // --- 2. WEBRTC & REAL-TIME SYNC ---
  useEffect(() => {
    if (view === 'room' && currentLounge) {
      initWebRTC();
      
      const channel = supabase.channel(`lounge-${currentLounge.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookmarks' }, (p) => {
          setCurrentBookmark(p.new.bookmark_number);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, (p) => {
          setQuestions(prev => [p.new, ...prev]);
        })
        .subscribe();

      return () => {
        if (pc.current) pc.current.close();
        supabase.removeChannel(channel);
      };
    }
  }, [view, currentLounge]);

  const initWebRTC = () => {
    try {
      const config: RTCPeerConnectionConfig = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      };
      
      pc.current = new (window as any).RTCPeerConnection(config);

      if (isHost) {
        const dc = pc.current.createDataChannel('classroom_io');
        setupDataChannel(dc);
      } else {
        pc.current.ondatachannel = (event: any) => {
          setupDataChannel(event.channel);
        };
      }

      pc.current.onconnectionstatechange = () => {
        setConnectionStatus(pc.current?.connectionState || 'Unknown');
      };
    } catch (error) {
      console.error('WebRTC initialization error:', error);
    }
  };

  const setupDataChannel = (channel: any) => {
    channel.onopen = () => setConnectionStatus('Live (P2P)');
    channel.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'QUESTION') setQuestions(prev => [data.payload, ...prev]);
        if (data.type === 'FILE') setSharedFiles(prev => [data.payload, ...prev]);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    setSendChannel(channel);
  };

  // --- 3. HANDLERS ---
  const handleCreateLounge = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{
        lounge_name: newLoungeName,
        host_name: newHostName,
        host_id: myId,
        entry_code: code
      }]).select();

      if (error) throw error;
      if (data) {
        setGeneratedCode(code);
        setCurrentLounge(data[0]);
        setIsHost(true);
        setView('room');
        setShowHostModal(false);
      }
    } catch (error) {
      alert('Error creating lounge: ' + (error as any)?.message);
    }
  };

  const handleJoinLounge = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');

      let lounge = currentLounge;

      if (!lounge || lounge.entry_code.toString() !== inputCode.trim()) {
        const { data, error } = await supabase
          .from('active_lounges')
          .select('*')
          .eq('entry_code', inputCode.trim())
          .single();

        if (error || !data) return alert('Invalid entry code!');
        lounge = data;
      }

      setCurrentLounge(lounge);
      setView('room');
      setShowJoinModal(false);
    } catch (error) {
      alert('Error joining lounge: ' + (error as any)?.message);
    }
  };

  const handleStartClass = async () => {
    try {
      const { error } = await supabase.from('class_sessions').insert([{
        lounge_id: currentLounge.id,
        status: 'active',
        current_bookmark: 0,
        started_at: new Date().toISOString(),
        last_updated: new Date().toISOString()
      }]);
      
      if (error) throw error;
      setSessionStatus('active');
    } catch (error) {
      alert('Error starting class: ' + (error as any)?.message);
    }
  };

  const handleSendQuestion = async () => {
    try {
      if (!questionInput.trim()) return alert('Question cannot be empty');
      
      const payload: Question = {
        user_name: isHost ? newHostName : (guestName || 'Student'),
        question_text: questionInput,
        bookmark_number: currentBookmark,
        answered: false
      };

      if (sendChannel?.readyState === 'open') {
        sendChannel.send(JSON.stringify({ type: 'QUESTION', payload }));
      }
      
      const { error } = await supabase.from('questions').insert([{ 
        ...payload, 
        lounge_id: currentLounge.id,
        peer_id: myId
      }]);
      
      if (error) throw error;
      setQuestions(prev => [payload, ...prev]);
      setQuestionInput('');
    } catch (error) {
      alert('Error sending question: ' + (error as any)?.message);
    }
  };

  const handleAnswerQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase
        .from('questions')
        .update({ answered: true })
        .eq('id', questionId);
      
      if (error) throw error;
      setQuestions(prev => 
        prev.map(q => q.id === questionId ? { ...q, answered: true } : q)
      );
    } catch (error) {
      alert('Error answering question: ' + (error as any)?.message);
    }
  };

  const handleNextBookmark = async () => {
    try {
      const hasUnresolved = questions.some(q => !q.answered);
      if (hasUnresolved) return alert('Please resolve all questions first.');
      
      const { error } = await supabase.from('bookmarks').insert([{
        lounge_id: currentLounge.id,
        bookmark_number: currentBookmark + 1,
        timestamp: Date.now(),
        created_at: new Date().toISOString()
      }]);
      
      if (error) throw error;
    } catch (error) {
      alert('Error advancing bookmark: ' + (error as any)?.message);
    }
  };

  const handleShareFile = async () => {
    try {
      const name = prompt('File Name:');
      const url = prompt('Link (URL):');
      
      if (!name || !url) return;
      
      const payload: FileShare = { 
        file_name: name, 
        file_url: url, 
        from_name: isHost ? newHostName : (guestName || 'Student')
      };
      
      if (sendChannel?.readyState === 'open') {
        sendChannel.send(JSON.stringify({ type: 'FILE', payload }));
      }
      
      const { error } = await supabase.from('file_shares').insert([{
        lounge_id: currentLounge.id,
        from_peer_id: myId,
        from_name: payload.from_name,
        to_peer_id: null,
        file_name: name,
        file_url: url,
        created_at: new Date().toISOString()
      }]);
      
      if (error) throw error;
      setSharedFiles(prev => [payload, ...prev]);
    } catch (error) {
      alert('Error sharing file: ' + (error as any)?.message);
    }
  };

  const handleBreak = async () => {
    try {
      const { error } = await supabase
        .from('class_sessions')
        .update({ status: 'on_break', last_updated: new Date().toISOString() })
        .eq('lounge_id', currentLounge.id);
      
      if (error) throw error;
      setSessionStatus('on_break');
    } catch (error) {
      alert('Error: ' + (error as any)?.message);
    }
  };

  const handleResume = async () => {
    try {
      const { error } = await supabase
        .from('class_sessions')
        .update({ status: 'active', last_updated: new Date().toISOString() })
        .eq('lounge_id', currentLounge.id);
      
      if (error) throw error;
      setSessionStatus('active');
    } catch (error) {
      alert('Error: ' + (error as any)?.message);
    }
  };

  const handleExit = async () => {
    try {
      setView('lobby');
      setCurrentLounge(null);
      setIsHost(false);
      setQuestions([]);
      setSharedFiles([]);
      setCurrentBookmark(0);
      await fetchLounges();
    } catch (error) {
      console.error('Error exiting:', error);
    }
  };

  // --- 4. UI COMPONENTS ---
  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Digital Lounge</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
          <button 
            onClick={() => setShowHostModal(true)} 
            style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer', border: 'none', fontSize: '16px', fontWeight: 'bold' }}
          >
            Host Class
          </button>
          <button 
            onClick={() => setShowJoinModal(true)} 
            style={{ padding: '15px 30px', background: '#fff', border: '2px solid #000', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
          >
            Join Class
          </button>
        </div>

        <div style={{ marginTop: '40px', maxWidth: '600px', margin: '40px auto' }}>
          <h3>Active Sessions</h3>
          {lounges.length === 0 ? (
            <p style={{ color: '#999' }}>No active sessions</p>
          ) : (
            lounges.map((lounge: any) => (
              <div key={lounge.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', textAlign: 'left' }}>
                <h4>{lounge.lounge_name}</h4>
                <p>Host: {lounge.host_name}</p>
                <button 
                  onClick={() => { setCurrentLounge(lounge); setShowJoinModal(true); }}
                  style={{ padding: '8px 15px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}
                >
                  Join
                </button>
              </div>
            ))
          )}
        </div>

        {/* HOST MODAL */}
        {showHostModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3>Host New Lounge</h3>
              <input 
                placeholder="Lounge Name" 
                value={newLoungeName}
                onChange={e => setNewLoungeName(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} 
              />
              <input 
                placeholder="Your Name" 
                value={newHostName}
                onChange={e => setNewHostName(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} 
              />
              <button 
                onClick={handleCreateLounge} 
                style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}
              >
                Launch
              </button>
              <button 
                onClick={() => setShowHostModal(false)} 
                style={{ marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* JOIN MODAL */}
        {showJoinModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3>Join Lounge</h3>
              <input 
                placeholder="Your Name" 
                value={guestName}
                onChange={e => setGuestName(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} 
              />
              <input 
                placeholder="Entry Code" 
                value={inputCode}
                onChange={e => setInputCode(e.target.value)} 
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc', fontSize: '18px', textAlign: 'center' }} 
              />
              <button 
                onClick={handleJoinLounge} 
                style={{ width: '100%', padding: '10px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}
              >
                Join
              </button>
              <button 
                onClick={() => setShowJoinModal(false)} 
                style={{ marginTop: '10px', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#f8f9fa' }}>
      <header style={{ background: '#111', color: '#fff', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{currentLounge?.lounge_name}</strong> | Code: {generatedCode || currentLounge?.entry_code}
          {isHost && <span style={{ marginLeft: '15px', background: '#28a745', padding: '5px 10px', borderRadius: '5px', fontSize: '12px' }}>HOST</span>}
          <small style={{ color: '#aaa', marginLeft: '15px' }}>{connectionStatus}</small>
        </div>
        <div>
          {isHost && sessionStatus === 'not_started' && (
            <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Start Class</button>
          )}
          {isHost && sessionStatus === 'active' && (
            <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Break</button>
          )}
          {isHost && sessionStatus === 'on_break' && (
            <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '8px 15px', marginRight: '10px', borderRadius: '5px', cursor: 'pointer' }}>Resume</button>
          )}
          <button onClick={handleExit} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' }}>Exit</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Main Area */}
        <div style={{ flex: 2, background: '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <p style={{ color: '#888', letterSpacing: '1px' }}>SESSION SYNC</p>
            <h1 style={{ fontSize: '80px', margin: '10px 0', fontWeight: 'bold' }}>#{currentBookmark}</h1>
            {isHost && (
              <button 
                onClick={handleNextBookmark} 
                style={{ padding: '10px 20px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' }}
              >
                ➕ Advance Bookmark
              </button>
            )}
          </div>

          <div style={{ width: '100%', maxWidth: '450px', background: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)' }}>
            <textarea 
              value={questionInput}
              onChange={e => setQuestionInput(e.target.value)}
              placeholder="Ask a question or share..."
              style={{ width: '100%', height: '70px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '10px', resize: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleSendQuestion} 
                style={{ flex: 1, padding: '12px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ❓ Send
              </button>
              <button 
                onClick={handleShareFile} 
                style={{ flex: 1, padding: '12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                📤 Share File
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar Feed */}
        <div style={{ flex: 1, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0 }}>Class Stream</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <h4>❓ Questions ({questions.length})</h4>
            {questions.length === 0 ? (
              <p style={{ color: '#999', fontSize: '14px' }}>No questions yet</p>
            ) : (
              questions.map((q, i) => (
                <div key={i} style={{ padding: '12px', background: '#fff3cd', borderRadius: '8px', marginBottom: '10px', borderLeft: '4px solid #ff9800' }}>
                  <small><strong>{q.user_name}</strong></small>
                  <p style={{ margin: '5px 0', fontSize: '14px' }}>{q.question_text}</p>
                  {isHost && !q.answered && (
                    <button 
                      onClick={() => q.id && handleAnswerQuestion(q.id)}
                      style={{ padding: '4px 8px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Mark Answered
                    </button>
                  )}
                  {q.answered && <span style={{ color: '#4caf50', fontSize: '12px' }}>✓ Answered</span>}
                </div>
              ))
            )}

            <h4 style={{ marginTop: '25px' }}>📁 Shared Files ({sharedFiles.length})</h4>
            {sharedFiles.length === 0 ? (
              <p style={{ color: '#999', fontSize: '14px' }}>No files shared</p>
            ) : (
              sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '10px', background: '#e7f3ff', borderRadius: '8px', marginBottom: '10px' }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontWeight: '500' }}>📄 {f.file_name}</a>
                  <br/><small>By {f.from_name}</small>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
