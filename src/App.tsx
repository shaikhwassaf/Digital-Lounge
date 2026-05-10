import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface Question { id?: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; }
interface FileShare { file_name: string; file_url: string; from_name: string; }
interface BookmarkPosition { type: 'video' | 'page' | 'chapter' | 'custom'; value: string; label: string; }

interface QuizQuestion {
  id: number;
  type: 'mc' | 'short' | 'long' | 'diagram' | 'derive';
  text: string;
  options: [string, string, string, string];
  correctOption: 'A' | 'B' | 'C' | 'D';
  requiresDiagram: boolean;
}

interface Quiz {
  id: string;
  type: 'short' | 'long';
  title: string;
  subject: string;
  questions: QuizQuestion[];
  timeLimit: number;
  bookmarkRef: number;
  createdAt: string;
}

interface QuizSubmission {
  studentName: string;
  peerId: string;
  answers: Record<number, string>;
  diagramUrls: Record<number, string>;
  submittedAt: string;
  mcScore?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const TYPE_ICONS: Record<string, string> = { video: '▶', page: '📖', chapter: '📌', custom: '📍' };
const TYPE_HINTS: Record<string, string> = { video: 'e.g. 12:34', page: 'e.g. 45', chapter: 'e.g. Chapter 3', custom: 'e.g. Slide 7' };
const TYPE_LABELS: Record<string, string> = { video: 'Video', page: 'Page', chapter: 'Chapter', custom: 'Position' };
const STEM_SUBJECTS = ['physics', 'chemistry', 'biology', 'maths', 'geometry', 'trigonometry', 'engineering'];
const QUESTION_TYPE_LABELS: Record<string, string> = { mc: 'Multiple Choice', short: 'Short Answer', long: 'Long Answer', diagram: 'Diagram + Label', derive: 'Derive / Prove' };

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const blankQuestion = (id: number, isStem: boolean): QuizQuestion => ({
  id, type: 'mc', text: '', options: ['', '', '', ''], correctOption: 'A', requiresDiagram: isStem,
});

// ─── Component ─────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Bookmark + Position
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<BookmarkPosition | null>(null);
  const [bookmarkHistory, setBookmarkHistory] = useState<Array<{ num: number; pos: BookmarkPosition }>>([]);
  const [nextType, setNextType] = useState<BookmarkPosition['type']>('video');
  const [nextValue, setNextValue] = useState('');

  // Questions / Files / Session
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // Poll
  const [pollActive, setPollActive] = useState(false);
  const [pollResponses, setPollResponses] = useState({ yes: 0, no: 0 });
  const [pollComplete, setPollComplete] = useState(false);
  const [pollScore, setPollScore] = useState<number | null>(null);
  const [studentPollAnswer, setStudentPollAnswer] = useState<boolean | null>(null);

  // Quiz Creator (host)
  const [showQuizCreator, setShowQuizCreator] = useState(false);
  const [quizCreatorType, setQuizCreatorType] = useState<'short' | 'long'>('short');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizSubject, setQuizSubject] = useState('general');
  const [quizTimeLimit, setQuizTimeLimit] = useState(5);
  const [draftQuestions, setDraftQuestions] = useState<QuizQuestion[]>([]);
  const [draftQIdCounter, setDraftQIdCounter] = useState(1);

  // Active quiz
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [studentDiagramUrls, setStudentDiagramUrls] = useState<Record<number, string>>({});
  const [quizTimeLeft, setQuizTimeLeft] = useState<number | null>(null);
  const [studentQuizSubmitted, setStudentQuizSubmitted] = useState(false);
  const [quizSubmissions, setQuizSubmissions] = useState<QuizSubmission[]>([]);
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Class timer (35-min reminder)
  const [classElapsed, setClassElapsed] = useState(0);
  const [showRefreshReminder, setShowRefreshReminder] = useState(false);

  // WebRTC
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

  // Form inputs
  const [newLoungeName, setNewLoungeName] = useState('');
  const [newHostName, setNewHostName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const [myId] = useState(() => {
    let id = localStorage.getItem('lounge_session_id');
    if (!id) { id = makeId(); localStorage.setItem('lounge_session_id', id); }
    return id;
  });

  // Derived
  const unansweredCount = questions.filter(q => q.bookmark_number === currentBookmark && !q.answered).length;
  const totalPollResponses = pollResponses.yes + pollResponses.no;
  const canRunPoll = unansweredCount === 0 && currentBookmark > 0;
  const canAdvance = unansweredCount === 0 && pollComplete && (pollScore ?? 0) >= 80 && nextValue.trim().length > 0;
  const isStemSubject = STEM_SUBJECTS.includes(quizSubject);
  const currentBmQs = questions.filter(q => q.bookmark_number === currentBookmark);
  const pastQs = questions.filter(q => q.bookmark_number !== currentBookmark);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { setInputCode(code); setCurrentLounge(null); setShowJoinModal(true); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { if (hostVideoRef.current && hostStream) hostVideoRef.current.srcObject = hostStream; }, [hostStream]);
  useEffect(() => { fetchLounges(); }, []);

  // Class elapsed timer → 35-min reminder
  useEffect(() => {
    if (sessionStatus !== 'active' || !isHost) return;
    const t = setInterval(() => {
      setClassElapsed(prev => {
        const next = prev + 1;
        if (next > 0 && next % (35 * 60) === 0) setShowRefreshReminder(true);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [sessionStatus, isHost]);

  // Quiz countdown
  useEffect(() => {
    if (quizTimeLeft === null || quizTimeLeft <= 0) {
      if (quizTimeLeft === 0 && !isHost && !studentQuizSubmitted && activeQuiz?.type === 'short') handleStudentSubmitQuiz(true);
      return;
    }
    const t = setTimeout(() => setQuizTimeLeft(p => (p ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [quizTimeLeft]);

  useEffect(() => { if (view === 'room' && currentLounge) { setupRoom(); return () => cleanupRoom(); } }, [view, currentLounge]);

  // ─── Room Setup ────────────────────────────────────────────────────────────

  const sendSignal = (event: string, payload: any) => signalingChannel.current?.send({ type: 'broadcast', event, payload });

  const createConnectionForStudent = async (studentId: string) => {
    if (peerConnections.current.has(studentId)) return;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections.current.set(studentId, pc);
    localStream.current?.getTracks().forEach(t => pc.addTrack(t, localStream.current!));
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice-candidate', { from: myId, target: studentId, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectedStudents(prev => [...new Set([...prev, studentId])]);
        setConnectionStatus('Live (P2P)');
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
    pc.ontrack = (e) => { if (e.streams?.[0]) { setHostStream(e.streams[0]); if (hostVideoRef.current) hostVideoRef.current.srcObject = e.streams[0]; } };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal('ice-candidate', { from: myId, target: hostId, candidate: e.candidate.toJSON() }); };
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
        setQuestions(prev => prev.some(q => q.id === p.new.id) ? prev : [p.new as Question, ...prev]);
      }).subscribe();
    dbChannel.current = dbc;

    const sc = supabase.channel(`signals-${currentLounge.id}`, { config: { broadcast: { self: false } } });
    sc.on('broadcast', { event: 'peer-join' }, async ({ payload }: any) => { if (!isHostRef.current) return; await createConnectionForStudent(payload.peerId); });
    sc.on('broadcast', { event: 'offer' }, async ({ payload }: any) => { if (isHostRef.current || payload.to !== myId) return; await handleIncomingOffer(payload.from, payload.sdp); });
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
    sc.on('broadcast', { event: 'bookmark-sync' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      if (payload.to && payload.to !== myId) return;
      setCurrentBookmark(payload.bookmark); setCurrentPosition(payload.position);
      setBookmarkHistory(prev => [{ num: payload.bookmark, pos: payload.position }, ...prev]);
      setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null);
    });
    sc.on('broadcast', { event: 'poll-start' }, () => { if (isHostRef.current) return; setStudentPollAnswer(null); setPollActive(true); });
    sc.on('broadcast', { event: 'poll-response' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      setPollResponses(prev => payload.understood ? { ...prev, yes: prev.yes + 1 } : { ...prev, no: prev.no + 1 });
    });
    sc.on('broadcast', { event: 'poll-end' }, () => { if (isHostRef.current) return; setPollActive(false); });

    // Quiz events
    sc.on('broadcast', { event: 'quiz-launch' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      const q: Quiz = payload.quiz;
      setActiveQuiz(q); setStudentAnswers({}); setStudentDiagramUrls({}); setStudentQuizSubmitted(false);
      setShowQuizModal(true);
      if (q.type === 'short' && q.timeLimit) setQuizTimeLeft(q.timeLimit * 60);
    });
    sc.on('broadcast', { event: 'quiz-submit' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      // Auto-grade MC
      let correct = 0; let mcCount = 0;
      (payload.quiz?.questions ?? []).forEach((q: QuizQuestion) => {
        if (q.type === 'mc') { mcCount++; if (payload.answers[q.id] === q.correctOption) correct++; }
      });
      const mcScore = mcCount > 0 ? Math.round((correct / mcCount) * 100) : undefined;
      const sub: QuizSubmission = { studentName: payload.studentName, peerId: payload.peerId, answers: payload.answers, diagramUrls: payload.diagramUrls ?? {}, submittedAt: new Date().toISOString(), mcScore };
      setQuizSubmissions(prev => [...prev, sub]);
      // Save long quiz submission to DB
      if (payload.quizType === 'long' && payload.quizId) {
        supabase.from('quiz_submissions').insert([{ quiz_id: payload.quizId, student_name: payload.studentName, peer_id: payload.peerId, answers: payload.answers, submitted_at: new Date().toISOString() }])
          .then(({ error }) => { if (error) console.warn('Submission DB:', error.message); });
      }
    });
    sc.on('broadcast', { event: 'quiz-end' }, () => { if (isHostRef.current) return; setShowQuizModal(false); setActiveQuiz(null); setQuizTimeLeft(null); });

    await sc.subscribe();
    signalingChannel.current = sc;

    if (isHostRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream; setCamActive(true); setMicActive(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream; setMediaError('');
      } catch {
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current = stream; setMicActive(true); setMediaError('Camera unavailable — audio only.'); }
        catch { setMediaError('Microphone/camera access denied.'); }
      }
    } else {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current = stream; setMicActive(true); setMediaError(''); }
      catch { setMediaError('Microphone access denied.'); }
      setTimeout(() => { sendSignal('peer-join', { peerId: myId }); setConnectionStatus('Connecting...'); }, 800);
    }
  };

  const cleanupRoom = () => {
    localStream.current?.getTracks().forEach(t => t.stop()); localStream.current = null;
    peerConnections.current.forEach(pc => pc.close()); peerConnections.current.clear();
    if (dbChannel.current) { supabase.removeChannel(dbChannel.current); dbChannel.current = null; }
    if (signalingChannel.current) { supabase.removeChannel(signalingChannel.current); signalingChannel.current = null; }
    setHostStream(null); setConnectedStudents([]); setMicActive(false); setCamActive(false);
    setConnectionStatus('Offline'); setMediaError(''); setCurrentPosition(null); setBookmarkHistory([]);
    setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null); setPollResponses({ yes: 0, no: 0 });
    setActiveQuiz(null); setShowQuizModal(false); setShowQuizResults(false); setQuizSubmissions([]); setQuizTimeLeft(null);
    setClassElapsed(0); setShowRefreshReminder(false);
  };

  const toggleMic = () => { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicActive(p => !p); };
  const toggleCam = () => { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamActive(p => !p); };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const fetchLounges = async () => { try { const { data } = await supabase.from('active_lounges').select('*'); if (data) setLounges(data); } catch (e) { console.error(e); } };

  // ─── Bookmark / Poll ───────────────────────────────────────────────────────

  const advanceBookmark = async () => {
    const nextNum = currentBookmark + 1;
    const pos: BookmarkPosition = { type: nextType, value: nextValue.trim(), label: `${TYPE_ICONS[nextType]} ${TYPE_LABELS[nextType]}: ${nextValue.trim()}` };
    try { await supabase.from('bookmarks').insert([{ lounge_id: currentLounge.id, bookmark_number: nextNum, timestamp: Date.now(), created_at: new Date().toISOString() }]); } catch {}
    sendSignal('bookmark-sync', { bookmark: nextNum, position: pos });
    setCurrentBookmark(nextNum); setCurrentPosition(pos);
    setBookmarkHistory(prev => [{ num: nextNum, pos }, ...prev]);
    setNextValue('');
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
    setStudentPollAnswer(understood); sendSignal('poll-response', { peerId: myId, understood });
  };

  // ─── Quiz Creator ──────────────────────────────────────────────────────────

  const openQuizCreator = (type: 'short' | 'long') => {
    setQuizCreatorType(type); setQuizTitle(''); setQuizSubject('general'); setQuizTimeLimit(5);
    setDraftQuestions([blankQuestion(1, false)]); setDraftQIdCounter(2); setShowQuizCreator(true);
  };

  const addDraftQuestion = () => {
    const id = draftQIdCounter; setDraftQIdCounter(p => p + 1);
    setDraftQuestions(prev => [...prev, blankQuestion(id, isStemSubject)]);
  };

  const removeDraftQuestion = (id: number) => setDraftQuestions(prev => prev.filter(q => q.id !== id));

  const updateDraftQuestion = (id: number, changes: Partial<QuizQuestion>) =>
    setDraftQuestions(prev => prev.map(q => q.id === id ? { ...q, ...changes } : q));

  const updateDraftOption = (qId: number, idx: number, val: string) =>
    setDraftQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const opts = [...q.options] as [string, string, string, string];
      opts[idx] = val; return { ...q, options: opts };
    }));

  const handleLaunchQuiz = async () => {
    if (!quizTitle.trim()) return alert('Please enter a quiz title.');
    if (draftQuestions.length === 0) return alert('Please add at least one question.');
    if (draftQuestions.some(q => !q.text.trim())) return alert('All questions must have text.');
    if (draftQuestions.some(q => q.type === 'mc' && q.options.some(o => !o.trim()))) return alert('All multiple choice options must be filled in.');

    const quiz: Quiz = {
      id: makeId(), type: quizCreatorType, title: quizTitle, subject: quizSubject,
      questions: draftQuestions, timeLimit: quizTimeLimit,
      bookmarkRef: currentBookmark, createdAt: new Date().toISOString(),
    };

    if (quizCreatorType === 'long') {
      try {
        const { data } = await supabase.from('quizzes').insert([{
          lounge_id: currentLounge.id, type: quiz.type, title: quiz.title, subject: quiz.subject,
          questions: quiz.questions, time_limit: quiz.timeLimit, bookmark_ref: quiz.bookmarkRef,
        }]).select();
        if (data?.[0]?.id) quiz.id = data[0].id;
      } catch (e) { console.warn('Quiz DB save failed (table may not exist yet):', (e as any)?.message); }
    }

    setActiveQuiz(quiz); setQuizSubmissions([]); setShowQuizCreator(false); setShowQuizResults(true);
    sendSignal('quiz-launch', { quiz });
    if (quizCreatorType === 'short') setQuizTimeLeft(quizTimeLimit * 60);
  };

  const handleStudentSubmitQuiz = (autoSubmit = false) => {
    if (studentQuizSubmitted) return;
    setStudentQuizSubmitted(true); setQuizTimeLeft(null);
    sendSignal('quiz-submit', {
      quizId: activeQuiz?.id, quizType: activeQuiz?.type, quiz: activeQuiz,
      studentName: guestName || 'Student', peerId: myId,
      answers: studentAnswers, diagramUrls: studentDiagramUrls,
    });
    if (!autoSubmit) { setShowQuizModal(false); }
  };

  const handleEndQuiz = () => {
    sendSignal('quiz-end', {}); setShowQuizResults(false); setActiveQuiz(null); setQuizTimeLeft(null);
    setShowQuizCreator(false); setQuizTitle(''); setDraftQuestions([]);
  };

  // ─── Other Handlers ────────────────────────────────────────────────────────

  const handleCreateLounge = async () => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('active_lounges').insert([{ lounge_name: newLoungeName, host_name: newHostName, host_id: myId, entry_code: code }]).select();
      if (error) throw error;
      if (data) { setGeneratedCode(code); setCurrentLounge(data[0]); isHostRef.current = true; setIsHost(true); setView('room'); setShowHostModal(false); }
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleJoinLounge = async () => {
    try {
      if (!guestName.trim()) return alert('Please enter your name.');
      if (!inputCode.trim()) return alert('Please enter the entry code.');
      let lounge = currentLounge;
      if (lounge) { if (inputCode.trim() !== lounge.entry_code.toString()) return alert('Wrong entry code.'); }
      else {
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
      const q: Question = { user_name: isHost ? newHostName : (guestName || 'Student'), question_text: questionInput, bookmark_number: currentBookmark, answered: false };
      const { data, error } = await supabase.from('questions').insert([{ ...q, lounge_id: currentLounge.id, peer_id: myId }]).select();
      if (error) throw error;
      setQuestions(prev => [data?.[0] ?? q as Question, ...prev]);
      setQuestionInput('');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleAnswerQuestion = async (qId: string) => {
    try {
      const { error } = await supabase.from('questions').update({ answered: true }).eq('id', qId);
      if (error) throw error;
      setQuestions(prev => prev.map(q => q.id === qId ? { ...q, answered: true } : q));
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleShareFile = async () => {
    const name = prompt('Resource Name:'); const url = prompt('Link (URL):');
    if (!name || !url) return;
    const f: FileShare = { file_name: name, file_url: url, from_name: isHost ? newHostName : (guestName || 'Student') };
    try {
      const { error } = await supabase.from('file_shares').insert([{ lounge_id: currentLounge.id, from_peer_id: myId, from_name: f.from_name, to_peer_id: null, file_name: name, file_url: url, created_at: new Date().toISOString() }]);
      if (error) throw error;
      setSharedFiles(prev => [f, ...prev]);
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleStartClass = async () => {
    try {
      const { error } = await supabase.from('class_sessions').insert([{ lounge_id: currentLounge.id, status: 'active', current_bookmark: 0, started_at: new Date().toISOString(), last_updated: new Date().toISOString() }]);
      if (error) throw error; setSessionStatus('active');
    } catch (e) { alert('Error: ' + (e as any)?.message); }
  };

  const handleBreak = async () => { try { await supabase.from('class_sessions').update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id); setSessionStatus('on_break'); } catch (e) { alert('Error'); } };
  const handleResume = async () => { try { await supabase.from('class_sessions').update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id); setSessionStatus('active'); } catch (e) { alert('Error'); } };
  const handleDeleteLounge = async (id: string) => { try { await supabase.from('active_lounges').delete().eq('id', id); await fetchLounges(); } catch (e) { alert('Error'); } };

  const handleExit = async () => {
    try {
      if (isHost && currentLounge) { if (window.confirm("End this lounge for everyone? Cancel to just leave.")) await supabase.from('active_lounges').delete().eq('id', currentLounge.id); }
      setView('lobby'); setCurrentLounge(null); isHostRef.current = false; setIsHost(false);
      setGeneratedCode(''); setQuestions([]); setSharedFiles([]); setCurrentBookmark(0); setSessionStatus('not_started');
      await fetchLounges();
    } catch (e) { console.error(e); }
  };

  const handleShareWhatsApp = () => {
    const c = generatedCode || currentLounge?.entry_code;
    const url = `${window.location.origin}?code=${c}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join "${currentLounge?.lounge_name}" on Digital Lounge!\n\nEntry Code: *${c}*\n\nTap to join (no app needed):\n${url}`)}`, '_blank');
  };

  const handleCopyLink = () => { navigator.clipboard.writeText(`${window.location.origin}?code=${generatedCode || currentLounge?.entry_code}`).then(() => alert('Link copied!')); };

  // ─── LOBBY ─────────────────────────────────────────────────────────────────

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '-10px' }}>Students join via WhatsApp link — no app needed</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
          <button onClick={() => setShowHostModal(true)} style={{ padding: '15px 30px', background: '#000', color: '#fff', borderRadius: '8px', cursor: 'pointer', border: 'none', fontSize: '16px', fontWeight: 'bold' }}>Host Class</button>
          <button onClick={() => { setCurrentLounge(null); setInputCode(''); setShowJoinModal(true); }} style={{ padding: '15px 30px', background: '#fff', border: '2px solid #000', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>Join Class</button>
        </div>
        <div style={{ maxWidth: '600px', margin: '40px auto' }}>
          <h3>Active Sessions</h3>
          {lounges.length === 0 ? <p style={{ color: '#999' }}>No active sessions</p> : lounges.map((l: any) => (
            <div key={l.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div><h4 style={{ margin: '0 0 4px' }}>{l.lounge_name}</h4><p style={{ margin: '0 0 10px', color: '#555' }}>Host: {l.host_name}</p></div>
                {l.host_id === myId && <span style={{ background: '#28a745', color: '#fff', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', alignSelf: 'flex-start' }}>YOUR LOUNGE</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {l.host_id === myId ? (
                  <><button onClick={() => { setCurrentLounge(l); setGeneratedCode(l.entry_code); isHostRef.current = true; setIsHost(true); setView('room'); }} style={{ padding: '8px 14px', background: '#28a745', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>Rejoin as Host</button>
                    <button onClick={() => { if (window.confirm('End this lounge?')) handleDeleteLounge(l.id); }} style={{ padding: '8px 14px', background: '#dc3545', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>End</button></>
                ) : <button onClick={() => { setCurrentLounge(l); setInputCode(''); setShowJoinModal(true); }} style={{ padding: '8px 14px', background: '#007bff', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none' }}>Join</button>}
              </div>
            </div>
          ))}
        </div>
        {showHostModal && <Modal onClose={() => setShowHostModal(false)} title="Host New Lounge">
          <input placeholder="Lounge Name" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={inputStyle} />
          <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ ...inputStyle, marginBottom: '15px' }} />
          <button onClick={handleCreateLounge} style={btnStyle('#000')}>Launch</button>
          <button onClick={() => setShowHostModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
        </Modal>}
        {showJoinModal && <Modal onClose={() => setShowJoinModal(false)} title="Join Lounge">
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px' }}>Have your content ready on this device — the host will sync your position.</p>
          <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={inputStyle} />
          <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ ...inputStyle, fontSize: '20px', textAlign: 'center', letterSpacing: '4px', marginBottom: '15px' }} />
          <button onClick={handleJoinLounge} style={btnStyle('#007bff')}>Join</button>
          <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
        </Modal>}
      </div>
    );
  }

  // ─── ROOM ──────────────────────────────────────────────────────────────────

  const code = generatedCode || currentLounge?.entry_code;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#f5f5f5' }}>

      {/* Header */}
      <header style={{ background: '#111', color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong>{currentLounge?.lounge_name}</strong>
          <span style={{ color: '#aaa', fontSize: '12px' }}>Code: {code}</span>
          {isHost && <span style={{ background: '#28a745', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>HOST</span>}
          <span style={{ fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#aaa' }}>● {connectionStatus}</span>
          {isHost && sessionStatus === 'active' && (
            <span style={{ fontSize: '11px', color: showRefreshReminder ? '#ff9800' : '#888' }}>
              {showRefreshReminder ? '⏰ 35 min — consider a Short Quiz!' : `⏱ ${formatTime(classElapsed)}`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isHost && <>
            <button onClick={handleShareWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📲 WhatsApp</button>
            <button onClick={handleCopyLink} style={{ background: '#555', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>🔗 Link</button>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>⚡ Short Quiz</button>
            <button onClick={() => openQuizCreator('long')} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📚 Homework</button>
            {sessionStatus === 'not_started' && <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Start</button>}
            {sessionStatus === 'active' && <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Break</button>}
            {sessionStatus === 'on_break' && <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Resume</button>}
          </>}
          <button onClick={handleExit} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Exit</button>
        </div>
      </header>

      {/* 35-min reminder banner */}
      {isHost && showRefreshReminder && (
        <div style={{ background: '#ff9800', color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 'bold' }}>⏰ 35 minutes elapsed — time for a Short Quiz refresher!</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#fff', color: '#ff9800', border: 'none', padding: '4px 12px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Launch Quiz</button>
            <button onClick={() => setShowRefreshReminder(false)} style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left Panel */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* AV Strip */}
          <div style={{ background: '#1c1c1c', padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '150px', height: '95px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: camActive ? 'block' : 'none' }} />
                  {!camActive && <div style={{ width: '150px', height: '95px', borderRadius: '6px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '28px' }}>🎙️</span></div>}
                  <div style={{ position: 'absolute', bottom: '4px', left: '4px', display: 'flex', gap: '3px' }}>
                    <button onClick={toggleMic} style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px' }}>{micActive ? '🎙️' : '🔇'}</button>
                    <button onClick={toggleCam} style={{ background: camActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer', fontSize: '12px' }}>{camActive ? '📹' : '📷'}</button>
                  </div>
                  <span style={{ position: 'absolute', top: '3px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>You</span>
                </div>
                <div style={{ color: '#ccc', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 4px', color: '#fff', fontWeight: 'bold', fontSize: '13px' }}>Students: {connectedStudents.length}</p>
                  {connectedStudents.length === 0 ? <span style={{ color: '#888' }}>Waiting for students...</span> :
                    connectedStudents.map((id, i) => <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#333', padding: '2px 8px', borderRadius: '20px', marginRight: '4px', fontSize: '11px' }}><span style={{ color: '#4caf50' }}>●</span> Student {i + 1}</span>)}
                  {mediaError && <p style={{ color: '#ff9800', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline style={{ width: '180px', height: '110px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: hostStream ? 'block' : 'none' }} />
                  {!hostStream && <div style={{ width: '180px', height: '110px', borderRadius: '6px', background: '#333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}><span style={{ fontSize: '22px' }}>📡</span><span style={{ color: '#888', fontSize: '11px' }}>{connectionStatus === 'Connecting...' ? 'Connecting...' : 'Awaiting host'}</span></div>}
                  <span style={{ position: 'absolute', top: '3px', left: '4px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>{currentLounge?.host_name}</span>
                </div>
                <div style={{ color: '#ccc' }}>
                  <button onClick={toggleMic} style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '6px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{micActive ? '🎙️ Mic On' : '🔇 Mic Off'}</button>
                  <p style={{ margin: '5px 0 0', fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#888' }}>{connectionStatus === 'Live (P2P)' ? '✓ Connected' : connectionStatus}</p>
                  {mediaError && <p style={{ color: '#ff9800', margin: '4px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* Main scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Bookmark display */}
            <div style={{ background: '#1a1a2e', color: '#fff', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '5px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '2px', color: '#7c83fd', fontWeight: 'bold' }}>BOOKMARK</span>
                <span style={{ fontSize: '36px', fontWeight: 'bold', lineHeight: 1 }}>#{currentBookmark}</span>
              </div>
              {currentPosition ? <>
                <p style={{ margin: 0, fontSize: '19px', fontWeight: '600' }}>{currentPosition.label}</p>
                {!isHost && <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#aaa' }}>Open your content and navigate to this position.</p>}
              </> : <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>{isHost ? 'Set the first Bookmark below to begin.' : 'Waiting for host to set the first Bookmark...'}</p>}
            </div>

            {/* HOST controls */}
            {isHost && <>
              <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '13px' }}>{currentBookmark === 0 ? '📍 Set First Bookmark' : `📍 Set Bookmark #${currentBookmark + 1}`}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={nextType} onChange={e => setNextType(e.target.value as BookmarkPosition['type'])} style={{ padding: '7px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>
                    <option value="video">▶ Video</option><option value="page">📖 Page</option><option value="chapter">📌 Chapter</option><option value="custom">📍 Custom</option>
                  </select>
                  <input value={nextValue} onChange={e => setNextValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && (currentBookmark === 0 ? nextValue.trim() && advanceBookmark() : canAdvance && advanceBookmark())} placeholder={TYPE_HINTS[nextType]} style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
                </div>
              </div>

              {currentBookmark === 0 ? (
                <button onClick={() => nextValue.trim() && advanceBookmark()} disabled={!nextValue.trim()} style={{ width: '100%', padding: '11px', background: nextValue.trim() ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: nextValue.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px' }}>Set Bookmark #1 & Sync Students</button>
              ) : (
                <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '13px' }}>Before Next Bookmark</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span>{unansweredCount === 0 ? '✅' : '🔴'}</span>
                    <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 1 — Answer all questions</span>
                    {unansweredCount > 0 && <span style={{ background: '#dc3545', color: '#fff', borderRadius: '20px', padding: '1px 8px', fontSize: '12px', fontWeight: 'bold' }}>{unansweredCount} unanswered</span>}
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span>{pollComplete && (pollScore ?? 0) >= 80 ? '✅' : pollComplete ? '⚠️' : '⬜'}</span>
                      <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 2 — Understanding poll ≥ 80%</span>
                    </div>
                    {!pollActive && !pollComplete && <button onClick={handleStartPoll} disabled={!canRunPoll} style={{ padding: '6px 14px', background: canRunPoll ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '6px', cursor: canRunPoll ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}>🗳 Run Understanding Poll</button>}
                    {pollActive && (
                      <div style={{ background: '#f0f0ff', borderRadius: '8px', padding: '10px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 'bold' }}>Poll live — {totalPollResponses} response{totalPollResponses !== 1 ? 's' : ''}</p>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ flex: 1, background: '#d4edda', borderRadius: '6px', padding: '5px', textAlign: 'center' }}><strong style={{ color: '#155724' }}>✓ {pollResponses.yes}</strong><p style={{ margin: 0, fontSize: '11px', color: '#155724' }}>Got it</p></div>
                          <div style={{ flex: 1, background: '#f8d7da', borderRadius: '6px', padding: '5px', textAlign: 'center' }}><strong style={{ color: '#721c24' }}>✗ {pollResponses.no}</strong><p style={{ margin: 0, fontSize: '11px', color: '#721c24' }}>Not yet</p></div>
                        </div>
                        {totalPollResponses > 0 && <div style={{ background: '#e9ecef', borderRadius: '4px', height: '7px', marginBottom: '6px' }}><div style={{ background: '#28a745', height: '100%', borderRadius: '4px', width: `${Math.round((pollResponses.yes / totalPollResponses) * 100)}%`, transition: 'width 0.3s' }} /></div>}
                        <button onClick={handleClosePoll} style={{ padding: '5px 12px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Close Poll</button>
                      </div>
                    )}
                    {pollComplete && pollScore !== null && (
                      <div style={{ background: pollScore >= 80 ? '#d4edda' : '#fff3cd', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{pollScore >= 80 ? '✅' : '⚠️'}</span>
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: pollScore >= 80 ? '#155724' : '#856404' }}>{pollScore}% understood</strong>
                          <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#666' }}>{totalPollResponses} response{totalPollResponses !== 1 ? 's' : ''} · {pollScore >= 80 ? 'Ready to advance!' : 'Consider re-teaching.'}</p>
                        </div>
                        {pollScore < 80 && <button onClick={handleStartPoll} style={{ padding: '4px 10px', background: '#7c83fd', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Re-run</button>}
                      </div>
                    )}
                  </div>
                  <button onClick={advanceBookmark} disabled={!canAdvance} style={{ width: '100%', padding: '10px', background: canAdvance ? '#28a745' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: canAdvance ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px' }}>
                    {canAdvance ? `✓ Set Bookmark #${currentBookmark + 1}` : '🔒 Next Bookmark (complete steps above)'}
                  </button>
                </div>
              )}

              {bookmarkHistory.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '10px', padding: '10px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: '11px', color: '#888' }}>BOOKMARK HISTORY</p>
                  {bookmarkHistory.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: i < bookmarkHistory.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <span style={{ background: i === 0 ? '#7c83fd' : '#eee', color: i === 0 ? '#fff' : '#555', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>#{b.num}</span>
                      <span style={{ fontSize: '12px', color: '#333' }}>{b.pos.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>}

            {/* Student: poll */}
            {!isHost && pollActive && (
              <div style={{ background: '#7c83fd', borderRadius: '12px', padding: '18px', color: '#fff', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8 }}>UNDERSTANDING CHECK</p>
                <p style={{ margin: '0 0 14px', fontSize: '17px', fontWeight: 'bold' }}>Do you understand this section?</p>
                {studentPollAnswer === null ? (
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button onClick={() => handlePollResponse(true)} style={{ flex: 1, maxWidth: '150px', padding: '11px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>✓ Yes, I got it!</button>
                    <button onClick={() => handlePollResponse(false)} style={{ flex: 1, maxWidth: '150px', padding: '11px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>✗ Not quite yet</button>
                  </div>
                ) : <p style={{ fontSize: '15px', margin: 0 }}>{studentPollAnswer ? '✓ Got it — response sent!' : '✓ Response sent — not yet.'}</p>}
              </div>
            )}

            {/* Q&A */}
            <div style={{ background: '#fff', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 7px', fontWeight: 'bold', fontSize: '13px' }}>💬 Ask a Question <span style={{ fontWeight: 'normal', color: '#888', fontSize: '12px' }}>(Bookmark #{currentBookmark})</span></p>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Type your question here..." style={{ width: '100%', height: '58px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'none', boxSizing: 'border-box', fontSize: '13px', marginBottom: '7px' }} />
              <div style={{ display: 'flex', gap: '7px' }}>
                <button onClick={handleSendQuestion} style={{ flex: 1, padding: '9px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>❓ Ask</button>
                <button onClick={handleShareFile} style={{ flex: 1, padding: '9px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>📤 Share Link</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div style={{ width: '290px', flexShrink: 0, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>❓ Questions</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {currentBmQs.length > 0 && <>
              <p style={{ margin: '0 0 5px', fontSize: '11px', fontWeight: 'bold', color: '#7c83fd', letterSpacing: '1px' }}>BOOKMARK #{currentBookmark} · {unansweredCount} unanswered</p>
              {currentBmQs.map((q, i) => (
                <div key={i} style={{ padding: '9px', background: q.answered ? '#f0f9f0' : '#fff8e1', borderRadius: '8px', marginBottom: '7px', borderLeft: `3px solid ${q.answered ? '#28a745' : '#ff9800'}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 'bold', color: '#666' }}>{q.user_name}</p>
                  <p style={{ margin: '0 0 5px', fontSize: '12px' }}>{q.question_text}</p>
                  {isHost && !q.answered && <button onClick={() => q.id && handleAnswerQuestion(q.id)} style={{ padding: '2px 7px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Mark Answered</button>}
                  {q.answered && <span style={{ color: '#28a745', fontSize: '11px' }}>✓ Answered</span>}
                </div>
              ))}
            </>}
            {currentBmQs.length === 0 && <p style={{ color: '#bbb', fontSize: '12px', textAlign: 'center', margin: '16px 0' }}>No questions for Bookmark #{currentBookmark} yet</p>}
            {sharedFiles.length > 0 && <>
              <p style={{ margin: '12px 0 5px', fontSize: '11px', fontWeight: 'bold', color: '#007bff', letterSpacing: '1px' }}>SHARED LINKS</p>
              {sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '7px', background: '#e8f4ff', borderRadius: '7px', marginBottom: '5px' }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontWeight: '500', fontSize: '12px' }}>📄 {f.file_name}</a>
                  <br /><small style={{ color: '#888' }}>By {f.from_name}</small>
                </div>
              ))}
            </>}
            {pastQs.length > 0 && <>
              <p style={{ margin: '12px 0 5px', fontSize: '11px', fontWeight: 'bold', color: '#aaa', letterSpacing: '1px' }}>EARLIER ({pastQs.length})</p>
              {pastQs.map((q, i) => (
                <div key={i} style={{ padding: '7px', background: '#f9f9f9', borderRadius: '6px', marginBottom: '4px', borderLeft: '2px solid #ddd', opacity: 0.7 }}>
                  <p style={{ margin: '0 0 1px', fontSize: '10px', color: '#888' }}>BM#{q.bookmark_number} · {q.user_name}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>{q.question_text}</p>
                </div>
              ))}
            </>}
          </div>
        </div>
      </div>

      {/* ── Quiz Creator Modal ── */}
      {showQuizCreator && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '680px', maxWidth: '96vw', padding: '24px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                {quizCreatorType === 'short' ? '⚡ Short Quiz — In-Class Refresher' : '📚 Long Quiz — Homework'}
              </h2>
              <button onClick={() => setShowQuizCreator(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>

            {/* Guidance */}
            <div style={{ background: quizCreatorType === 'short' ? '#fff8e1' : '#f3e8ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#555' }}>
              {quizCreatorType === 'short'
                ? '⚡ Short Quiz: Quick 3-5 question refresher. Use multiple choice for instant auto-grading. Trigger after every ~35 minutes.'
                : '📚 Homework: Conceptual questions that demand deep understanding. For STEM subjects, include at least one Diagram or Derive/Prove question. These should be challenging even with AI tools — ask students to explain their reasoning, draw diagrams, or derive results from first principles.'}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '180px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Quiz Title</label>
                <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder={quizCreatorType === 'short' ? 'e.g. Midpoint Refresher' : 'e.g. Chapter 5 Conceptual Homework'} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              {quizCreatorType === 'long' && (
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Subject</label>
                  <select value={quizSubject} onChange={e => { setQuizSubject(e.target.value); if (STEM_SUBJECTS.includes(e.target.value)) setDraftQuestions(prev => prev.map(q => ({ ...q, requiresDiagram: true }))); }}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value="general">General</option>
                    <option value="physics">Physics</option>
                    <option value="chemistry">Chemistry</option>
                    <option value="biology">Biology</option>
                    <option value="maths">Mathematics</option>
                    <option value="geometry">Geometry</option>
                    <option value="trigonometry">Trigonometry</option>
                    <option value="engineering">Engineering</option>
                  </select>
                </div>
              )}
              {quizCreatorType === 'short' && (
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' }}>Time Limit</label>
                  <select value={quizTimeLimit} onChange={e => setQuizTimeLimit(Number(e.target.value))} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value={3}>3 min</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option>
                  </select>
                </div>
              )}
            </div>

            {isStemSubject && <div style={{ background: '#fde8ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#6d28d9' }}>📐 STEM subject detected — include at least one <strong>Diagram + Label</strong> or <strong>Derive/Prove</strong> question. Students will submit a diagram URL.</div>}

            {/* Questions */}
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '13px' }}>Questions ({draftQuestions.length})</p>
              {draftQuestions.map((q, qi) => (
                <div key={q.id} style={{ background: '#f8f8f8', borderRadius: '10px', padding: '12px', marginBottom: '10px', border: '1px solid #eee' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ background: '#7c83fd', color: '#fff', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: 'bold', flexShrink: 0 }}>Q{qi + 1}</span>
                    <select value={q.type} onChange={e => updateDraftQuestion(q.id, { type: e.target.value as QuizQuestion['type'] })} style={{ padding: '5px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '12px', cursor: 'pointer' }}>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {(q.type === 'diagram' || q.type === 'derive') && <span style={{ fontSize: '11px', color: '#6d28d9', background: '#f3e8ff', padding: '2px 7px', borderRadius: '4px' }}>📐 Diagram required</span>}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#666', marginLeft: 'auto', cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.requiresDiagram} onChange={e => updateDraftQuestion(q.id, { requiresDiagram: e.target.checked })} /> Needs diagram
                    </label>
                    {draftQuestions.length > 1 && <button onClick={() => removeDraftQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px', padding: '0' }}>✕</button>}
                  </div>
                  <textarea value={q.text} onChange={e => updateDraftQuestion(q.id, { text: e.target.value })} placeholder={
                    q.type === 'mc' ? 'Enter your question...' :
                    q.type === 'derive' ? 'e.g. Derive the expression for centripetal acceleration from first principles...' :
                    q.type === 'diagram' ? 'e.g. Draw and label a fully annotated diagram of the human heart...' :
                    q.type === 'long' ? 'e.g. A student claims that... Is this correct? Justify with reasoning.' :
                    'e.g. Explain why...'
                  } style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', resize: 'vertical', minHeight: '58px', boxSizing: 'border-box', marginBottom: q.type === 'mc' ? '8px' : '0' }} />
                  {q.type === 'mc' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ background: q.correctOption === letter ? '#28a745' : '#ddd', color: q.correctOption === letter ? '#fff' : '#555', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }} onClick={() => updateDraftQuestion(q.id, { correctOption: letter })}>{letter}</span>
                          <input value={q.options[idx]} onChange={e => updateDraftOption(q.id, idx, e.target.value)} placeholder={`Option ${letter}`} style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '12px' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === 'mc' && <p style={{ margin: '5px 0 0', fontSize: '11px', color: '#888' }}>Click a letter above to mark it as the correct answer (green).</p>}
                </div>
              ))}
              <button onClick={addDraftQuestion} style={{ width: '100%', padding: '9px', background: '#f0f0f0', border: '1px dashed #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>+ Add Question</button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleLaunchQuiz} style={{ flex: 1, padding: '12px', background: quizCreatorType === 'short' ? '#f59e0b' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                {quizCreatorType === 'short' ? '⚡ Launch Short Quiz' : '📚 Send as Homework'}
              </button>
              <button onClick={() => setShowQuizCreator(false)} style={{ padding: '12px 20px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student Quiz Modal ── */}
      {showQuizModal && activeQuiz && !isHost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '600px', maxWidth: '96vw', padding: '24px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '11px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', fontWeight: 'bold' }}>{activeQuiz.type === 'short' ? '⚡ SHORT QUIZ' : '📚 HOMEWORK QUIZ'}</p>
                <h2 style={{ margin: 0, fontSize: '18px' }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? '#dc3545' : '#333', color: '#fff', padding: '8px 14px', borderRadius: '8px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px' }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>

            {activeQuiz.type === 'long' && <div style={{ background: '#f3e8ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12px', color: '#6d28d9' }}>This is a conceptual homework quiz. Show your reasoning — not just answers. For diagram questions, draw on paper, photograph it, upload to any image host (e.g. imgur.com) and paste the URL.</div>}

            <div style={{ marginBottom: '16px' }}>
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} style={{ background: '#f8f8f8', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                  <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '14px' }}>Q{i + 1}. {q.text}</p>
                  {q.type === 'mc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <label key={letter} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 10px', borderRadius: '6px', background: studentAnswers[q.id] === letter ? '#e0e7ff' : '#fff', border: `1px solid ${studentAnswers[q.id] === letter ? '#7c83fd' : '#ddd'}` }}>
                          <input type="radio" name={`q-${q.id}`} value={letter} checked={studentAnswers[q.id] === letter} onChange={() => setStudentAnswers(prev => ({ ...prev, [q.id]: letter }))} disabled={studentQuizSubmitted} style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '13px' }}><strong>{letter}.</strong> {q.options[idx]}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(q.type === 'short' || q.type === 'long' || q.type === 'derive') && (
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted}
                      placeholder={q.type === 'derive' ? 'Show all your working. State assumptions. Derive step by step...' : q.type === 'long' ? 'Write a detailed conceptual answer with reasoning...' : 'Write your answer in 2-3 sentences...'}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical', minHeight: q.type === 'long' || q.type === 'derive' ? '120px' : '70px', fontSize: '13px', boxSizing: 'border-box' }} />
                  )}
                  {q.type === 'diagram' && (
                    <>
                      <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="Describe what your diagram shows (labels, annotations, key features)..." style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical', minHeight: '80px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '8px' }} />
                      <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Paste your diagram image URL here (draw on paper → photo → upload to imgur.com)" style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #6d28d9', fontSize: '12px', boxSizing: 'border-box', color: '#6d28d9' }} />
                    </>
                  )}
                  {q.requiresDiagram && q.type !== 'diagram' && (
                    <div style={{ marginTop: '8px' }}>
                      <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Diagram URL (optional but recommended)" style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px dashed #6d28d9', fontSize: '12px', boxSizing: 'border-box', color: '#6d28d9' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!studentQuizSubmitted ? (
              <button onClick={() => handleStudentSubmitQuiz(false)} style={{ width: '100%', padding: '12px', background: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                {activeQuiz.type === 'short' ? '⚡ Submit Quiz' : '📚 Submit Homework'}
              </button>
            ) : (
              <div style={{ background: '#d4edda', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <p style={{ margin: 0, color: '#155724', fontWeight: 'bold', fontSize: '14px' }}>✓ Submitted! Your answers have been sent to the host.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Host Quiz Results Panel ── */}
      {showQuizResults && activeQuiz && isHost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '20px 0' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '700px', maxWidth: '96vw', padding: '24px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '11px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', fontWeight: 'bold' }}>{activeQuiz.type === 'short' ? '⚡ SHORT QUIZ — RESULTS' : '📚 HOMEWORK — RESULTS'}</p>
                <h2 style={{ margin: 0, fontSize: '18px' }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? '#dc3545' : '#333', color: '#fff', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px' }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: '#f0f0f0', borderRadius: '8px', padding: '10px 14px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{quizSubmissions.length}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Submissions</p>
              </div>
              {activeQuiz.questions.some(q => q.type === 'mc') && quizSubmissions.length > 0 && (
                <div style={{ flex: 1, background: '#e8f5e9', borderRadius: '8px', padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#2e7d32' }}>
                    {Math.round(quizSubmissions.reduce((sum, s) => sum + (s.mcScore ?? 0), 0) / quizSubmissions.length)}%
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Avg MC Score</p>
                </div>
              )}
              <div style={{ flex: 1, background: '#fff3e0', borderRadius: '8px', padding: '10px 14px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#e65100' }}>{connectedStudents.length}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Connected</p>
              </div>
            </div>

            <div style={{ maxHeight: '360px', overflowY: 'auto', marginBottom: '14px' }}>
              {quizSubmissions.length === 0
                ? <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>Waiting for submissions...</p>
                : quizSubmissions.map((sub, i) => (
                  <div key={i} style={{ background: '#f8f8f8', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '14px' }}>{sub.studentName}</strong>
                      {sub.mcScore !== undefined && (
                        <span style={{ background: sub.mcScore >= 80 ? '#d4edda' : sub.mcScore >= 60 ? '#fff3cd' : '#f8d7da', color: sub.mcScore >= 80 ? '#155724' : sub.mcScore >= 60 ? '#856404' : '#721c24', padding: '3px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold' }}>
                          MC: {sub.mcScore}%
                        </span>
                      )}
                    </div>
                    {activeQuiz.questions.map((q, qi) => (
                      <div key={q.id} style={{ marginBottom: '6px', paddingBottom: '6px', borderBottom: qi < activeQuiz.questions.length - 1 ? '1px solid #eee' : 'none' }}>
                        <p style={{ margin: '0 0 3px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>Q{qi + 1}: {q.text.substring(0, 60)}{q.text.length > 60 ? '...' : ''}</p>
                        {q.type === 'mc' && (
                          <p style={{ margin: 0, fontSize: '13px', color: sub.answers[q.id] === q.correctOption ? '#28a745' : '#dc3545' }}>
                            {sub.answers[q.id] === q.correctOption ? '✓' : '✗'} {sub.answers[q.id] || 'Not answered'} {sub.answers[q.id] !== q.correctOption && <span style={{ color: '#888' }}>(correct: {q.correctOption})</span>}
                          </p>
                        )}
                        {q.type !== 'mc' && <p style={{ margin: 0, fontSize: '12px', color: '#333', background: '#fff', padding: '5px 8px', borderRadius: '5px', border: '1px solid #eee' }}>{sub.answers[q.id] || <em style={{ color: '#aaa' }}>No answer</em>}</p>}
                        {sub.diagramUrls[q.id] && <a href={sub.diagramUrls[q.id]} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#6d28d9', display: 'block', marginTop: '4px' }}>📐 View Diagram</a>}
                      </div>
                    ))}
                  </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleEndQuiz} style={{ flex: 1, padding: '11px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>End Quiz</button>
              <button onClick={() => setShowQuizResults(false)} style={{ padding: '11px 20px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Close Panel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI helpers ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc', fontSize: '14px' };
const btnStyle = (bg: string): React.CSSProperties => ({ width: '100%', padding: '10px', background: bg, color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px', fontSize: '14px' });

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', padding: '28px', borderRadius: '12px', width: '350px', maxWidth: '94vw' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
