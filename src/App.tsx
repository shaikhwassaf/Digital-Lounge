import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

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

interface BookmarkPosition {
  type: 'video' | 'page' | 'chapter' | 'custom';
  value: string;
  label: string;
}

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

const TYPE_ICONS: Record<string, string> = {
  video: '▶', page: '📖', chapter: '📌', custom: '📍',
};
const TYPE_HINTS: Record<string, string> = {
  video: 'e.g. 12:34', page: 'e.g. 45', chapter: 'e.g. Chapter 3', custom: 'e.g. Slide 7',
};
const TYPE_LABELS: Record<string, string> = {
  video: 'Video', page: 'Page', chapter: 'Chapter', custom: 'Position',
};

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);

  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // ── Bookmark + Position ──
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<BookmarkPosition | null>(null);
  const [bookmarkHistory, setBookmarkHistory] = useState<Array<{ num: number; pos: BookmarkPosition }>>([]);
  const [nextType, setNextType] = useState<BookmarkPosition['type']>('video');
  const [nextValue, setNextValue] = useState('');

  // ── Questions ──
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // ── Poll ──
  const [pollActive, setPollActive] = useState(false);
  const [pollResponses, setPollResponses] = useState({ yes: 0, no: 0 });
  const [pollComplete, setPollComplete] = useState(false);
  const [pollScore, setPollScore] = useState<number | null>(null);
  const [studentPollAnswer, setStudentPollAnswer] = useState<boolean | null>(null);

  // ── WebRTC ──
  const localStream = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const signalingChannel = useRef<any>(null);
  const dbChannel = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const [hostStream, setHostStream] = useState<MediaStream | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState('Offline');
  const [mediaError, setMediaError] = useState('');

  // ── Form inputs ──
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    let id = localStorage.getItem('lounge_session_id');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem('lounge_session_id', id);
    }
    return id;
  });

  // ── Derived: unanswered questions for current bookmark ──
  const unansweredAtBookmark = questions.filter(q => q.bookmark_number === currentBookmark && !q.answered);
  const unansweredCount = unansweredAtBookmark.length;
  const totalResponses = pollResponses.yes + pollResponses.no;
  const canRunPoll = unansweredCount === 0 && currentBookmark > 0;
  const canAdvance = unansweredCount === 0 && pollComplete && (pollScore ?? 0) >= 80 && nextValue.trim().length > 0;

  // ── URL auto-join ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setInputCode(code);
      setCurrentLounge(null);
      setShowJoinModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    if (hostVideoRef.current && hostStream) hostVideoRef.current.srcObject = hostStream;
  }, [hostStream]);

  useEffect(() => { fetchLounges(); }, []);

  const fetchLounges = async () => {
    try {
      const { data } = await supabase.from('active_lounges').select('*');
      if (data) setLounges(data);
    } catch (e) { console.error(e); }
  };

  // ─── Room Setup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (view === 'room' && currentLounge) {
      setupRoom();
      return () => cleanupRoom();
    }
  }, [view, currentLounge]);

  const sendSignal = (event: string, payload: any) =>
    signalingChannel.current?.send({ type: 'broadcast', event, payload });

  const createConnectionForStudent = async (studentId: string) => {
    if (peerConnections.current.has(studentId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(studentId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice-candidate', { from: myId, target: studentId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedStudents(prev => [...new Set([...prev, studentId])]);
        setConnectionStatus('Live (P2P)');
        // Send current position to newly joined student
        if (currentPosition) sendSignal('bookmark-sync', { bookmark: currentBookmark, position: currentPosition, to: studentId });
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setConnectedStudents(prev => prev.filter(id => id !== studentId));
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal('offer', { from: myId, to: studentId, sdp: pc.localDescription });
  };

  const handleIncomingOffer = async (hostId: string, sdp: any) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(hostId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.ontrack = (e) => {
      if (e.streams?.[0]) { setHostStream(e.streams[0]); if (hostVideoRef.current) hostVideoRef.current.srcObject = e.streams[0]; }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice-candidate', { from: myId, target: hostId, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnectionStatus('Live (P2P)');
      else if (['disconnected', 'failed'].includes(pc.connectionState)) setConnectionStatus('Disconnected');
    };
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal('answer', { from: myId, to: hostId, sdp: pc.localDescription });
  };

  const setupRoom = async () => {
    const dbc = supabase.channel(`lounge-db-${currentLounge.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions' }, (p) => {
        setQuestions(prev => {
          if (prev.some(q => q.id === p.new.id)) return prev;
          return [p.new as Question, ...prev];
        });
      })
      .subscribe();
    dbChannel.current = dbc;

    const sc = supabase.channel(`signals-${currentLounge.id}`, {
      config: { broadcast: { self: false } }
    });

    sc.on('broadcast', { event: 'peer-join' }, async ({ payload }: any) => {
      if (!isHostRef.current) return;
      await createConnectionForStudent(payload.peerId);
    });
    sc.on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
      if (isHostRef.current || payload.to !== myId) return;
      await handleIncomingOffer(payload.from, payload.sdp);
    });
    sc.on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
      if (!isHostRef.current || payload.to !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    });
    sc.on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
      if (payload.target !== myId) return;
      const pc = peerConnections.current.get(payload.from);
      if (pc && payload.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_) {} }
    });

    // Bookmark sync (received by students)
    sc.on('broadcast', { event: 'bookmark-sync' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      if (payload.to && payload.to !== myId) return;
      setCurrentBookmark(payload.bookmark);
      setCurrentPosition(payload.position);
      setBookmarkHistory(prev => [{ num: payload.bookmark, pos: payload.position }, ...prev]);
      // Reset poll state for this new section
      setPollActive(false);
      setPollComplete(false);
      setPollScore(null);
      setStudentPollAnswer(null);
    });

    // Poll events
    sc.on('broadcast', { event: 'poll-start' }, () => {
      if (isHostRef.current) return;
      setStudentPollAnswer(null);
      setPollActive(true);
    });
    sc.on('broadcast', { event: 'poll-response' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      setPollResponses(prev => payload.understood ? { ...prev, yes: prev.yes + 1 } : { ...prev, no: prev.no + 1 });
    });
    sc.on('broadcast', { event: 'poll-end' }, () => {
      if (isHostRef.current) return;
      setPollActive(false);
    });

    await sc.subscribe();
    signalingChannel.current = sc;

    // Get media
    if (isHostRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream; setCamActive(true); setMicActive(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setMediaError('');
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStream.current = stream; setMicActive(true); setMediaError('Camera unavailable — audio only.');
        } catch { setMediaError('Microphone/camera access denied.'); }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream.current = stream; setMicActive(true); setMediaError('');
      } catch { setMediaError('Microphone access denied.'); }
      setTimeout(() => { sendSignal('peer-join', { peerId: myId }); setConnectionStatus('Connecting...'); }, 800);
    }
  };

  const cleanupRoom = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    if (dbChannel.current) { supabase.removeChannel(dbChannel.current); dbChannel.current = null; }
    if (signalingChannel.current) { supabase.removeChannel(signalingChannel.current); signalingChannel.current = null; }
    setHostStream(null); setConnectedStudents([]); setMicActive(false); setCamActive(false);
    setConnectionStatus('Offline'); setMediaError('');
    setCurrentPosition(null); setBookmarkHistory([]);
    setPollActive(false); setPollComplete(false); setPollScore(null);
    setStudentPollAnswer(null); setPollResponses({ yes: 0, no: 0 });
  };

  const toggleMic = () => { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicActive(p => !p); };
  const toggleCam = () => { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamActive(p => !p); };

  // ─── Bookmark / Poll Handlers ─────────────────────────────────────────────

  const handleSetFirstBookmark = async () => {
    if (!nextValue.trim()) return alert('Please enter a position for the first Bookmark.');
    await advanceBookmark();
  };

  const handleNextBookmark = async () => {
    if (!canAdvance) return;
    await advanceBookmark();
  };

  const advanceBookmark = async () => {
    const nextNum = currentBookmark + 1;
    const pos: BookmarkPosition = {
      type: nextType,
      value: nextValue.trim(),
      label: `${TYPE_ICONS[nextType]} ${TYPE_LABELS[nextType]}: ${nextValue.trim()}`
    };
    try {
      await supabase.from('bookmarks').insert([{
        lounge_id: currentLounge.id, bookmark_number: nextNum,
        timestamp: Date.now(), created_at: new Date().toISOString()
      }]);
    } catch (e) { console.error('Bookmark DB error:', e); }

    sendSignal('bookmark-sync', { bookmark: nextNum, position: pos });
    setCurrentBookmark(nextNum);
    setCurrentPosition(pos);
    setBookmarkHistory(prev => [{ num: nextNum, pos }, ...prev]);
    setNextValue('');
    // Reset poll state for new section
    setPollActive(false); setPollComplete(false); setPollScore(null); setPollResponses({ yes: 0, no: 0 });
  };

  const handleStartPoll = () => {
    if (!canRunPoll) return;
    setPollActive(true); setPollComplete(false); setPollResponses({ yes: 0, no: 0 }); setPollScore(null);
    sendSignal('poll-start', { bookmark: currentBookmark });
  };

  const handleClosePoll = () => {
    const total = pollResponses.yes + pollResponses.no;
    const score = total > 0 ? Math.round((pollResponses.yes / total) * 100) : 0;
    setPollScore(score); setPollComplete(true); setPollActive(false);
    sendSignal('poll-end', {});
  };

  const handlePollResponse = (understood: boolean) => {
    if (studentPollAnswer !== null) return;
    setStudentPollAnswer(understood);
    sendSignal('poll-response', { peerId: myId, understood });
  };

  // ─── Other Handlers ────────────────────────────────────────────────────────

  const handleCreateLounge = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{
        lounge_name: newLoungeName, host_name: newHostName, host_id: myId, entry_code: code
      }]).select();
      if (error) throw error;
      if (data) { setGeneratedCode(code); setCurrentLounge(data[0]); isHostRef.current = true; setIsHost(true); setView('room'); setShowHostModal(false); }
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleJoinLounge = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');
      if (!inputCode.trim()) return alert('Please enter the entry code.');
      let lounge = currentLounge;
      if (lounge) {
        if (inputCode.trim() !== lounge.entry_code.toString()) return alert('Wrong entry code.');
      } else {
        const { data, error } = await supabase.from('active_lounges').select('*').eq('entry_code', inputCode.trim()).single();
        if (error || !data) return alert('No lounge found with that entry code.');
        lounge = data;
      }
      isHostRef.current = false; setIsHost(false); setCurrentLounge(lounge); setView('room'); setShowJoinModal(false);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleSendQuestion = async () => {
    try {
      if (!questionInput.trim()) return alert('Question cannot be empty');
      const q: Question = {
        user_name: isHost ? newHostName : (guestName || 'Student'),
        question_text: questionInput, bookmark_number: currentBookmark, answered: false
      };
      const { data, error } = await supabase.from('questions').insert([{ ...q, lounge_id: currentLounge.id, peer_id: myId }]).select();
      if (error) throw error;
      if (data) setQuestions(prev => [data[0] as Question, ...prev]);
      else setQuestions(prev => [q, ...prev]);
      setQuestionInput('');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleAnswerQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase.from('questions').update({ answered: true }).eq('id', questionId);
      if (error) throw error;
      setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, answered: true } : q));
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleShareFile = async () => {
    try {
      const name = prompt('File / Resource Name:');
      const url = prompt('Link (URL):');
      if (!name || !url) return;
      const f: FileShare = { file_name: name, file_url: url, from_name: isHost ? newHostName : (guestName || 'Student') };
      const { error } = await supabase.from('file_shares').insert([{
        lounge_id: currentLounge.id, from_peer_id: myId, from_name: f.from_name,
        to_peer_id: null, file_name: name, file_url: url, created_at: new Date().toISOString()
      }]);
      if (error) throw error;
      setSharedFiles(prev => [f, ...prev]);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleStartClass = async () => {
    try {
      const { error } = await supabase.from('class_sessions').insert([{
        lounge_id: currentLounge.id, status: 'active', current_bookmark: 0,
        started_at: new Date().toISOString(), last_updated: new Date().toISOString()
      }]);
      if (error) throw error;
      setSessionStatus('active');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleBreak = async () => {
    try {
      await supabase.from('class_sessions').update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id);
      setSessionStatus('on_break');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleResume = async () => {
    try {
      await supabase.from('class_sessions').update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id);
      setSessionStatus('active');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleDeleteLounge = async (id: string) => {
    try { await supabase.from('active_lounges').delete().eq('id', id); await fetchLounges(); }
    catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleExit = async () => {
    try {
      if (isHost && currentLounge) {
        const end = window.confirm("End this lounge for everyone? Cancel to just leave.");
        if (end) await supabase.from('active_lounges').delete().eq('id', currentLounge.id);
      }
      setView('lobby'); setCurrentLounge(null); isHostRef.current = false; setIsHost(false);
      setGeneratedCode(''); setQuestions([]); setSharedFiles([]); setCurrentBookmark(0); setSessionStatus('not_started');
      await fetchLounges();
    } catch (e) { console.error(e); }
  };

  const handleShareWhatsApp = () => {
    const code = generatedCode || currentLounge?.entry_code;
    const url = `${window.location.origin}?code=${code}`;
    const text = `Join "${currentLounge?.lounge_name}" on Digital Lounge!\n\nEntry Code: *${code}*\n\nTap to join (no app needed):\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyLink = () => {
    const code = generatedCode || currentLounge?.entry_code;
    navigator.clipboard.writeText(`${window.location.origin}?code=${code}`)
      .then(() => alert('Link copied!'));
  };

  // ─── LOBBY ────────────────────────────────────────────────────────────────

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '-10px' }}>Students join via WhatsApp link — no app needed</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
          <button onClick={() => setShowHostModal(true)}
            style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer', border: 'none', fontSize: '16px', fontWeight: 'bold' }}>
            Host Class
          </button>
          <button onClick={() => { setCurrentLounge(null); setInputCode(''); setShowJoinModal(true); }}
            style={{ padding: '15px 30px', background: '#fff', border: '2px solid #000', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
            Join Class
          </button>
        </div>

        <div style={{ maxWidth: '600px', margin: '40px auto' }}>
          <h3>Active Sessions</h3>
          {lounges.length === 0 ? <p style={{ color: '#999' }}>No active sessions</p> : (
            lounges.map((l: any) => (
              <div key={l.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><h4 style={{ margin: '0 0 4px' }}>{l.lounge_name}</h4><p style={{ margin: '0 0 10px', color: '#555' }}>Host: {l.host_name}</p></div>
                  {l.host_id === myId && <span style={{ background: '#28a745', color: '#fff', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', alignSelf: 'flex-start' }}>YOUR LOUNGE</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {l.host_id === myId ? (
                    <>
                      <button onClick={() => { setCurrentLounge(l); setGeneratedCode(l.entry_code); isHostRef.current = true; setIsHost(true); setView('room'); }}
                        style={{ padding: '8px 14px', background: '#28a745', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>Rejoin as Host</button>
                      <button onClick={() => { if (window.confirm('End this lounge?')) handleDeleteLounge(l.id); }}
                        style={{ padding: '8px 14px', background: '#dc3545', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>End</button>
                    </>
                  ) : (
                    <button onClick={() => { setCurrentLounge(l); setInputCode(''); setShowJoinModal(true); }}
                      style={{ padding: '8px 14px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>Join</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {showHostModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3 style={{ marginTop: 0 }}>Host New Lounge</h3>
              <input placeholder="Lounge Name" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <button onClick={handleCreateLounge}
                style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}>
                Launch
              </button>
              <button onClick={() => setShowHostModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {showJoinModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '350px' }}>
              <h3 style={{ marginTop: 0 }}>Join Lounge</h3>
              <p style={{ color: '#666', fontSize: '13px', marginTop: 0 }}>Have your content ready on this device — the host will sync your position.</p>
              <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc' }} />
              <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)}
                style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc', fontSize: '20px', textAlign: 'center', letterSpacing: '4px' }} />
              <button onClick={handleJoinLounge}
                style={{ width: '100%', padding: '10px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px' }}>
                Join
              </button>
              <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── ROOM ─────────────────────────────────────────────────────────────────

  const code = generatedCode || currentLounge?.entry_code;
  const currentBmQs = questions.filter(q => q.bookmark_number === currentBookmark);
  const pastQs = questions.filter(q => q.bookmark_number !== currentBookmark);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#f5f5f5' }}>

      {/* ── Header ── */}
      <header style={{ background: '#111', color: '#fff', padding: '9px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <strong style={{ fontSize: '15px' }}>{currentLounge?.lounge_name}</strong>
          <span style={{ color: '#aaa', fontSize: '12px' }}>Code: {code}</span>
          {isHost && <span style={{ background: '#28a745', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>HOST</span>}
          <span style={{ fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#aaa' }}>● {connectionStatus}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {isHost && <>
            <button onClick={handleShareWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📲 WhatsApp</button>
            <button onClick={handleCopyLink} style={{ background: '#555', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>🔗 Link</button>
            {sessionStatus === 'not_started' && <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Start</button>}
            {sessionStatus === 'active' && <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Break</button>}
            {sessionStatus === 'on_break' && <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Resume</button>}
          </>}
          <button onClick={handleExit} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '5px 11px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Exit</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: Main Panel ── */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Audio/Video Strip */}
          <div style={{ background: '#1c1c1c', padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline
                    style={{ width: '150px', height: '95px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: camActive ? 'block' : 'none' }} />
                  {!camActive && (
                    <div style={{ width: '150px', height: '95px', borderRadius: '6px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '28px' }}>🎙️</span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', display: 'flex', gap: '3px' }}>
                    <button onClick={toggleMic} title={micActive ? 'Mute' : 'Unmute'}
                      style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px' }}>
                      {micActive ? '🎙️' : '🔇'}
                    </button>
                    <button onClick={toggleCam} title={camActive ? 'Camera off' : 'Camera on'}
                      style={{ background: camActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px' }}>
                      {camActive ? '📹' : '📷'}
                    </button>
                  </div>
                  <span style={{ position: 'absolute', top: '3px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>You</span>
                </div>
                <div style={{ color: '#ccc', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Students: {connectedStudents.length}</p>
                  {connectedStudents.length === 0
                    ? <span style={{ color: '#888' }}>Waiting for students...</span>
                    : connectedStudents.map((id, i) => (
                      <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#333', padding: '2px 8px', borderRadius: '20px', marginRight: '4px', fontSize: '11px' }}>
                        <span style={{ color: '#4caf50' }}>●</span> Student {i + 1}
                      </span>
                    ))}
                  {mediaError && <p style={{ color: '#ff9800', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline
                    style={{ width: '180px', height: '110px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: hostStream ? 'block' : 'none' }} />
                  {!hostStream && (
                    <div style={{ width: '180px', height: '110px', borderRadius: '6px', background: '#333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '22px' }}>📡</span>
                      <span style={{ color: '#888', fontSize: '11px' }}>{connectionStatus === 'Connecting...' ? 'Connecting...' : 'Awaiting host'}</span>
                    </div>
                  )}
                  <span style={{ position: 'absolute', top: '3px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>{currentLounge?.host_name}</span>
                </div>
                <div style={{ color: '#ccc' }}>
                  <button onClick={toggleMic}
                    style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>
                    {micActive ? '🎙️ Mic On' : '🔇 Mic Off'}
                  </button>
                  <p style={{ margin: '5px 0 0', fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#888' }}>
                    {connectionStatus === 'Live (P2P)' ? '✓ Connected' : connectionStatus}
                  </p>
                  {mediaError && <p style={{ color: '#ff9800', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* ── Bookmark Panel ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Current Bookmark Display */}
            <div style={{ background: '#1a1a2e', color: '#fff', borderRadius: '12px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '2px', color: '#7c83fd', fontWeight: 'bold' }}>BOOKMARK</span>
                <span style={{ fontSize: '38px', fontWeight: 'bold', lineHeight: 1 }}>#{currentBookmark}</span>
              </div>
              {currentPosition ? (
                <>
                  <p style={{ margin: '0', fontSize: '20px', fontWeight: '600' }}>{currentPosition.label}</p>
                  {!isHost && <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#aaa' }}>Open your content and navigate to this position.</p>}
                </>
              ) : (
                <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                  {isHost ? 'Set the first Bookmark below to begin.' : 'Waiting for host to set the first Bookmark...'}
                </p>
              )}
            </div>

            {/* HOST CONTROLS */}
            {isHost && (
              <>
                {/* Next Bookmark Input */}
                <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>
                    {currentBookmark === 0 ? '📍 Set First Bookmark' : `📍 Set Bookmark #${currentBookmark + 1}`}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select value={nextType} onChange={e => setNextType(e.target.value as BookmarkPosition['type'])}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>
                      <option value="video">▶ Video</option>
                      <option value="page">📖 Page</option>
                      <option value="chapter">📌 Chapter</option>
                      <option value="custom">📍 Custom</option>
                    </select>
                    <input value={nextValue} onChange={e => setNextValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (currentBookmark === 0 ? handleSetFirstBookmark() : canAdvance && handleNextBookmark())}
                      placeholder={TYPE_HINTS[nextType]}
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
                  </div>
                </div>

                {/* Gate Status */}
                {currentBookmark > 0 && (
                  <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <p style={{ margin: '0 0 12px', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>Before Next Bookmark</p>

                    {/* Step 1: Questions */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '16px' }}>{unansweredCount === 0 ? '✅' : '🔴'}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px' }}>
                          Step 1 — Answer all questions
                        </span>
                        {unansweredCount > 0 && (
                          <span style={{ background: '#dc3545', color: '#fff', borderRadius: '20px', padding: '1px 8px', fontSize: '12px', fontWeight: 'bold' }}>
                            {unansweredCount} unanswered
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Poll */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{pollComplete && (pollScore ?? 0) >= 80 ? '✅' : pollComplete ? '⚠️' : '⬜'}</span>
                        <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 2 — Understanding poll ≥ 80%</span>
                      </div>

                      {!pollActive && !pollComplete && (
                        <button onClick={handleStartPoll} disabled={!canRunPoll}
                          style={{ padding: '7px 16px', background: canRunPoll ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '6px', cursor: canRunPoll ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}>
                          🗳 Run Understanding Poll
                        </button>
                      )}

                      {pollActive && (
                        <div style={{ background: '#f0f0ff', borderRadius: '8px', padding: '10px 14px' }}>
                          <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 'bold', color: '#333' }}>
                            Poll live — {totalResponses} response{totalResponses !== 1 ? 's' : ''}
                          </p>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ flex: 1, background: '#d4edda', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
                              <strong style={{ color: '#155724' }}>✓ {pollResponses.yes}</strong>
                              <p style={{ margin: 0, fontSize: '11px', color: '#155724' }}>Got it</p>
                            </div>
                            <div style={{ flex: 1, background: '#f8d7da', borderRadius: '6px', padding: '6px 10px', textAlign: 'center' }}>
                              <strong style={{ color: '#721c24' }}>✗ {pollResponses.no}</strong>
                              <p style={{ margin: 0, fontSize: '11px', color: '#721c24' }}>Not yet</p>
                            </div>
                          </div>
                          {totalResponses > 0 && (
                            <div style={{ background: '#e9ecef', borderRadius: '4px', height: '8px', marginBottom: '8px' }}>
                              <div style={{ background: '#28a745', height: '100%', borderRadius: '4px', width: `${Math.round((pollResponses.yes / totalResponses) * 100)}%`, transition: 'width 0.3s' }} />
                            </div>
                          )}
                          <button onClick={handleClosePoll}
                            style={{ padding: '6px 14px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                            Close Poll
                          </button>
                        </div>
                      )}

                      {pollComplete && pollScore !== null && (
                        <div style={{ background: (pollScore >= 80) ? '#d4edda' : '#fff3cd', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '22px' }}>{pollScore >= 80 ? '✅' : '⚠️'}</span>
                          <div>
                            <strong style={{ fontSize: '16px', color: pollScore >= 80 ? '#155724' : '#856404' }}>{pollScore}% understood</strong>
                            <p style={{ margin: '1px 0 0', fontSize: '12px', color: '#666' }}>
                              {totalResponses} response{totalResponses !== 1 ? 's' : ''} · {pollScore >= 80 ? 'Ready to advance!' : 'Consider re-teaching before advancing.'}
                            </p>
                          </div>
                          {pollScore < 80 && (
                            <button onClick={handleStartPoll} style={{ marginLeft: 'auto', padding: '5px 10px', background: '#7c83fd', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                              Re-run
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Next Bookmark Button */}
                    <button onClick={handleNextBookmark} disabled={!canAdvance}
                      style={{ width: '100%', padding: '11px', background: canAdvance ? '#28a745' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: canAdvance ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px', marginTop: '4px' }}>
                      {canAdvance ? `✓ Set Bookmark #${currentBookmark + 1}` : `🔒 Next Bookmark (complete steps above)`}
                    </button>
                  </div>
                )}

                {/* First bookmark button */}
                {currentBookmark === 0 && (
                  <button onClick={handleSetFirstBookmark} disabled={!nextValue.trim()}
                    style={{ width: '100%', padding: '12px', background: nextValue.trim() ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: nextValue.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px' }}>
                    Set Bookmark #1 & Sync Students
                  </button>
                )}

                {/* Bookmark History */}
                {bookmarkHistory.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '12px', color: '#888' }}>BOOKMARK HISTORY</p>
                    {bookmarkHistory.map((b, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: i < bookmarkHistory.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                        <span style={{ background: i === 0 ? '#7c83fd' : '#eee', color: i === 0 ? '#fff' : '#555', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>#{b.num}</span>
                        <span style={{ fontSize: '13px', color: '#333' }}>{b.pos.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* STUDENT VIEW — Poll */}
            {!isHost && pollActive && (
              <div style={{ background: '#7c83fd', borderRadius: '12px', padding: '20px', color: '#fff', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8 }}>UNDERSTANDING CHECK</p>
                <p style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 'bold' }}>Do you understand this section?</p>
                {studentPollAnswer === null ? (
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button onClick={() => handlePollResponse(true)}
                      style={{ flex: 1, maxWidth: '160px', padding: '12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
                      ✓ Yes, I got it!
                    </button>
                    <button onClick={() => handlePollResponse(false)}
                      style={{ flex: 1, maxWidth: '160px', padding: '12px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
                      ✗ Not quite yet
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '16px', margin: 0 }}>
                    {studentPollAnswer ? '✓ Response sent — you said Got it!' : '✓ Response sent — you said Not yet'}
                  </p>
                )}
              </div>
            )}

            {/* Q&A Input */}
            <div style={{ background: '#fff', borderRadius: '10px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '13px', color: '#333' }}>
                💬 Ask a Question <span style={{ fontWeight: 'normal', color: '#888', fontSize: '12px' }}>(linked to Bookmark #{currentBookmark})</span>
              </p>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)}
                placeholder="Type your question here..."
                style={{ width: '100%', height: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'none', boxSizing: 'border-box', fontSize: '13px', marginBottom: '8px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSendQuestion}
                  style={{ flex: 1, padding: '9px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                  ❓ Ask
                </button>
                <button onClick={handleShareFile}
                  style={{ flex: 1, padding: '9px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                  📤 Share Link
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Right: Questions Sidebar ── */}
        <div style={{ width: '300px', flexShrink: 0, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>❓ Questions</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>

            {/* Current bookmark's questions */}
            {currentBmQs.length > 0 && (
              <>
                <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 'bold', color: '#7c83fd', letterSpacing: '1px' }}>
                  BOOKMARK #{currentBookmark} · {unansweredCount} unanswered
                </p>
                {currentBmQs.map((q, i) => (
                  <div key={i} style={{ padding: '10px', background: q.answered ? '#f0f9f0' : '#fff8e1', borderRadius: '8px', marginBottom: '8px', borderLeft: `3px solid ${q.answered ? '#28a745' : '#ff9800'}` }}>
                    <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 'bold', color: '#666' }}>{q.user_name}</p>
                    <p style={{ margin: '0 0 6px', fontSize: '13px' }}>{q.question_text}</p>
                    {isHost && !q.answered && (
                      <button onClick={() => q.id && handleAnswerQuestion(q.id)}
                        style={{ padding: '3px 8px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                        Mark Answered
                      </button>
                    )}
                    {q.answered && <span style={{ color: '#28a745', fontSize: '11px' }}>✓ Answered</span>}
                  </div>
                ))}
              </>
            )}

            {currentBmQs.length === 0 && (
              <p style={{ color: '#bbb', fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>No questions for Bookmark #{currentBookmark} yet</p>
            )}

            {/* Shared Files */}
            {sharedFiles.length > 0 && (
              <>
                <p style={{ margin: '16px 0 6px', fontSize: '11px', fontWeight: 'bold', color: '#007bff', letterSpacing: '1px' }}>SHARED LINKS</p>
                {sharedFiles.map((f, i) => (
                  <div key={i} style={{ padding: '8px', background: '#e8f4ff', borderRadius: '8px', marginBottom: '6px' }}>
                    <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontWeight: '500', fontSize: '13px' }}>📄 {f.file_name}</a>
                    <br /><small style={{ color: '#888' }}>By {f.from_name}</small>
                  </div>
                ))}
              </>
            )}

            {/* Past questions (collapsed) */}
            {pastQs.length > 0 && (
              <>
                <p style={{ margin: '16px 0 6px', fontSize: '11px', fontWeight: 'bold', color: '#aaa', letterSpacing: '1px' }}>EARLIER QUESTIONS ({pastQs.length})</p>
                {pastQs.map((q, i) => (
                  <div key={i} style={{ padding: '8px', background: '#f9f9f9', borderRadius: '6px', marginBottom: '5px', borderLeft: '2px solid #ccc', opacity: 0.7 }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#888' }}>BM#{q.bookmark_number} · {q.user_name}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#555' }}>{q.question_text}</p>
                  </div>
                ))}
              </>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
