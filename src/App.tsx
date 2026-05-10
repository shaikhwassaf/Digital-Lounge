import { useEffect, useState, useRef } from 'react';
import { supabase } from './lib/supabaseClient';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface Question { id?: string; user_name: string; question_text: string; bookmark_number: number; answered: boolean; peer_id?: string; }
interface FileShare { file_name: string; file_url: string; from_name: string; }
interface BookmarkPosition { type: 'video' | 'page' | 'chapter' | 'custom'; value: string; label: string; }
interface QuizQuestion { id: number; type: 'mc' | 'short' | 'long' | 'diagram' | 'derive'; text: string; options: [string, string, string, string]; correctOption: 'A' | 'B' | 'C' | 'D'; requiresDiagram: boolean; }
interface Quiz { id: string; type: 'short' | 'long'; title: string; subject: string; questions: QuizQuestion[]; timeLimit: number; bookmarkRef: number; createdAt: string; }
interface QuizSubmission { studentName: string; peerId: string; answers: Record<number, string>; diagramUrls: Record<number, string>; submittedAt: string; mcScore?: number; }
interface ExitTicketResponse { studentName: string; mainIdea: string; unclear: string; rating: number; }
interface LeaderboardEntry { peerId: string; name: string; points: number; }

// ─── Constants ─────────────────────────────────────────────────────────────

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const TYPE_ICONS: Record<string, string> = { video: '▶', page: '📖', chapter: '📌', custom: '📍' };
const TYPE_HINTS: Record<string, string> = { video: 'e.g. 12:34', page: 'e.g. 45', chapter: 'e.g. Chapter 3', custom: 'e.g. Slide 7' };
const TYPE_LABELS: Record<string, string> = { video: 'Video', page: 'Page', chapter: 'Chapter', custom: 'Position' };
const STEM_SUBJECTS = ['physics', 'chemistry', 'biology', 'maths', 'geometry', 'trigonometry', 'engineering'];
const QUESTION_TYPE_LABELS: Record<string, string> = { mc: 'Multiple Choice', short: 'Short Answer', long: 'Long Answer', diagram: 'Diagram + Label', derive: 'Derive / Prove' };

const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const blankQuestion = (id: number, isStem: boolean): QuizQuestion => ({ id, type: 'mc', text: '', options: ['', '', '', ''], correctOption: 'A', requiresDiagram: isStem });

// ─── Formula Rendering ─────────────────────────────────────────────────────

function parseMath(text: string): string {
  return text
    .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ')
    .replace(/\\epsilon/g,'ε').replace(/\\eta/g,'η').replace(/\\theta/g,'θ').replace(/\\kappa/g,'κ')
    .replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\nu/g,'ν').replace(/\\xi/g,'ξ')
    .replace(/\\pi/g,'π').replace(/\\rho/g,'ρ').replace(/\\sigma/g,'σ').replace(/\\tau/g,'τ')
    .replace(/\\phi/g,'φ').replace(/\\chi/g,'χ').replace(/\\psi/g,'ψ').replace(/\\omega/g,'ω')
    .replace(/\\Delta/g,'Δ').replace(/\\Gamma/g,'Γ').replace(/\\Lambda/g,'Λ').replace(/\\Pi/g,'Π')
    .replace(/\\Sigma/g,'Σ').replace(/\\Phi/g,'Φ').replace(/\\Psi/g,'Ψ').replace(/\\Omega/g,'Ω')
    .replace(/\^0/g,'⁰').replace(/\^1/g,'¹').replace(/\^2/g,'²').replace(/\^3/g,'³')
    .replace(/\^4/g,'⁴').replace(/\^5/g,'⁵').replace(/\^6/g,'⁶').replace(/\^7/g,'⁷')
    .replace(/\^8/g,'⁸').replace(/\^9/g,'⁹').replace(/\^n/g,'ⁿ').replace(/\^-1/g,'⁻¹').replace(/\^-2/g,'⁻²')
    .replace(/_0/g,'₀').replace(/_1/g,'₁').replace(/_2/g,'₂').replace(/_3/g,'₃')
    .replace(/_4/g,'₄').replace(/_5/g,'₅').replace(/_6/g,'₆').replace(/_7/g,'₇')
    .replace(/_8/g,'₈').replace(/_9/g,'₉').replace(/_n/g,'ₙ')
    .replace(/\\sqrt/g,'√').replace(/\\pm/g,'±').replace(/\\mp/g,'∓').replace(/\\times/g,'×')
    .replace(/\\div/g,'÷').replace(/\\cdot/g,'·').replace(/\\neq/g,'≠').replace(/\\leq/g,'≤')
    .replace(/\\geq/g,'≥').replace(/\\approx/g,'≈').replace(/\\equiv/g,'≡').replace(/\\infty/g,'∞')
    .replace(/\\degree/g,'°').replace(/\\angle/g,'∠').replace(/\\perp/g,'⊥').replace(/\\parallel/g,'∥')
    .replace(/\\triangle/g,'△').replace(/\\rightarrow/g,'→').replace(/\\leftarrow/g,'←')
    .replace(/\\Rightarrow/g,'⇒').replace(/\\therefore/g,'∴').replace(/\\because/g,'∵')
    .replace(/\\int/g,'∫').replace(/\\partial/g,'∂').replace(/\\nabla/g,'∇');
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<'lobby' | 'room'>('lobby');
  const [isHost, setIsHost] = useState(false);
  const isHostRef = useRef(false);
  const [currentLounge, setCurrentLounge] = useState<any>(null);
  const [lounges, setLounges] = useState<any[]>([]);
  const [showHostModal, setShowHostModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Bookmark
  const [currentBookmark, setCurrentBookmark] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<BookmarkPosition | null>(null);
  const [bookmarkHistory, setBookmarkHistory] = useState<Array<{ num: number; pos: BookmarkPosition }>>([]);
  const [nextType, setNextType] = useState<BookmarkPosition['type']>('video');
  const [nextValue, setNextValue] = useState('');

  // Questions / Session
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [sessionStatus, setSessionStatus] = useState<'not_started' | 'active' | 'on_break' | 'ended'>('not_started');

  // Poll
  const [pollActive, setPollActive] = useState(false);
  const [pollResponses, setPollResponses] = useState({ yes: 0, no: 0 });
  const [pollResponseDetails, setPollResponseDetails] = useState<{ peerId: string; name: string; understood: boolean }[]>([]);
  const [pollComplete, setPollComplete] = useState(false);
  const [pollScore, setPollScore] = useState<number | null>(null);
  const [studentPollAnswer, setStudentPollAnswer] = useState<boolean | null>(null);

  // Quiz Creator
  const [showQuizCreator, setShowQuizCreator] = useState(false);
  const [quizCreatorType, setQuizCreatorType] = useState<'short' | 'long'>('short');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizSubject, setQuizSubject] = useState('general');
  const [quizTimeLimit, setQuizTimeLimit] = useState(5);
  const [draftQuestions, setDraftQuestions] = useState<QuizQuestion[]>([]);
  const [draftQIdCounter, setDraftQIdCounter] = useState(1);

  // Active Quiz
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [studentDiagramUrls, setStudentDiagramUrls] = useState<Record<number, string>>({});
  const [quizTimeLeft, setQuizTimeLeft] = useState<number | null>(null);
  const [studentQuizSubmitted, setStudentQuizSubmitted] = useState(false);
  const [quizSubmissions, setQuizSubmissions] = useState<QuizSubmission[]>([]);
  const [showQuizResults, setShowQuizResults] = useState(false);

  // ── Feature 4: Exit Ticket ──
  const [showExitTicket, setShowExitTicket] = useState(false);
  const [exitAnswer, setExitAnswer] = useState({ mainIdea: '', unclear: '', rating: 0 });
  const [exitSubmitted, setExitSubmitted] = useState(false);
  const [exitResponses, setExitResponses] = useState<ExitTicketResponse[]>([]);
  const [showExitSummary, setShowExitSummary] = useState(false);

  // ── Feature 5: Progress Tracking ──
  const [showProgress, setShowProgress] = useState(false);

  // ── Feature 8: Spaced Repetition ──
  const [showReminder, setShowReminder] = useState(false);
  const [reminderQuiz, setReminderQuiz] = useState<Quiz | null>(null);

  // ── Feature 10: Leaderboard ──
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const leaderboardRef = useRef<LeaderboardEntry[]>([]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);

  // Broadcast leaderboard to students whenever it changes
  useEffect(() => {
    if (isHost && view === 'room' && leaderboard.length > 0) sendSignal('leaderboard-update', { entries: leaderboard });
  }, [leaderboard]);

  // Class timer
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

  // ─── Leaderboard helper ─────────────────────────────────────────────────

  const awardPoints = (peerId: string, name: string, pts: number) => {
    setLeaderboard(prev => {
      const exists = prev.find(e => e.peerId === peerId);
      if (exists) return [...prev.map(e => e.peerId === peerId ? { ...e, points: e.points + pts } : e)].sort((a, b) => b.points - a.points);
      return [...prev, { peerId, name, points: pts }].sort((a, b) => b.points - a.points);
    });
  };

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) { setInputCode(code); setCurrentLounge(null); setShowJoinModal(true); window.history.replaceState({}, '', window.location.pathname); }
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { if (hostVideoRef.current && hostStream) hostVideoRef.current.srcObject = hostStream; }, [hostStream]);
  useEffect(() => { fetchLounges(); }, []);

  useEffect(() => {
    if (sessionStatus !== 'active' || !isHost) return;
    const t = setInterval(() => {
      setClassElapsed(prev => { const next = prev + 1; if (next > 0 && next % (35 * 60) === 0) setShowRefreshReminder(true); return next; });
    }, 1000);
    return () => clearInterval(t);
  }, [sessionStatus, isHost]);

  useEffect(() => {
    if (quizTimeLeft === null || quizTimeLeft <= 0) {
      if (quizTimeLeft === 0 && !isHost && !studentQuizSubmitted && activeQuiz?.type === 'short') handleStudentSubmitQuiz(true);
      return;
    }
    const t = setTimeout(() => setQuizTimeLeft(p => (p ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [quizTimeLeft]);

  useEffect(() => { if (view === 'room' && currentLounge) { setupRoom(); return () => cleanupRoom(); } }, [view, currentLounge]);

  // ─── Room Setup ─────────────────────────────────────────────────────────────

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
        if (leaderboardRef.current.length > 0) sendSignal('leaderboard-update', { entries: leaderboardRef.current });
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
        // Award points for asking a question (not host)
        if (isHostRef.current && p.new.peer_id && p.new.user_name) {
          awardPoints(p.new.peer_id, p.new.user_name, 3);
        }
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
      setPollResponseDetails(prev => [...prev, { peerId: payload.peerId, name: payload.name || 'Student', understood: payload.understood }]);
      awardPoints(payload.peerId, payload.name || 'Student', 2); // +2 for poll participation
    });
    sc.on('broadcast', { event: 'poll-end' }, () => { if (isHostRef.current) return; setPollActive(false); });

    sc.on('broadcast', { event: 'quiz-launch' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      const q: Quiz = payload.quiz;
      setActiveQuiz(q); setStudentAnswers({}); setStudentDiagramUrls({}); setStudentQuizSubmitted(false);
      setShowQuizModal(true);
      if (q.type === 'short' && q.timeLimit) setQuizTimeLeft(q.timeLimit * 60);
    });
    sc.on('broadcast', { event: 'quiz-submit' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      let correct = 0; let mcCount = 0;
      (payload.quiz?.questions ?? []).forEach((q: QuizQuestion) => {
        if (q.type === 'mc') { mcCount++; if (payload.answers[q.id] === q.correctOption) correct++; }
      });
      const mcScore = mcCount > 0 ? Math.round((correct / mcCount) * 100) : undefined;
      setQuizSubmissions(prev => [...prev, { studentName: payload.studentName, peerId: payload.peerId, answers: payload.answers, diagramUrls: payload.diagramUrls ?? {}, submittedAt: new Date().toISOString(), mcScore }]);
      // Award points: long quiz +5, short quiz +10 per correct MC
      const pts = payload.quizType === 'long' ? 5 : correct * 10;
      if (pts > 0) awardPoints(payload.peerId, payload.studentName, pts);
      if (payload.quizType === 'long' && payload.quizId) {
        supabase.from('quiz_submissions').insert([{ quiz_id: payload.quizId, student_name: payload.studentName, peer_id: payload.peerId, answers: payload.answers, submitted_at: new Date().toISOString() }])
          .then(({ error }) => { if (error) console.warn('Submission DB:', error.message); });
      }
    });
    sc.on('broadcast', { event: 'quiz-end' }, () => { if (isHostRef.current) return; setShowQuizModal(false); setActiveQuiz(null); setQuizTimeLeft(null); });

    // Exit Ticket
    sc.on('broadcast', { event: 'exit-ticket-start' }, () => {
      if (isHostRef.current) return;
      setExitAnswer({ mainIdea: '', unclear: '', rating: 0 }); setExitSubmitted(false); setShowExitTicket(true);
    });
    sc.on('broadcast', { event: 'exit-ticket-submit' }, ({ payload }: any) => {
      if (!isHostRef.current) return;
      setExitResponses(prev => [...prev, payload]);
      awardPoints(payload.peerId, payload.studentName, 2); // +2 for exit ticket
    });
    sc.on('broadcast', { event: 'exit-ticket-end' }, () => { if (isHostRef.current) return; setShowExitTicket(false); });

    // Leaderboard
    sc.on('broadcast', { event: 'leaderboard-update' }, ({ payload }: any) => {
      if (isHostRef.current) return;
      setLeaderboard(payload.entries);
    });

    await sc.subscribe();
    signalingChannel.current = sc;

    if (isHostRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.current = stream; setCamActive(true); setMicActive(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream; setMediaError('');
      } catch {
        try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); localStream.current = stream; setMicActive(true); setMediaError('Camera unavailable.'); }
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
    setPollActive(false); setPollComplete(false); setPollScore(null); setStudentPollAnswer(null); setPollResponses({ yes: 0, no: 0 }); setPollResponseDetails([]);
    setActiveQuiz(null); setShowQuizModal(false); setShowQuizResults(false); setQuizSubmissions([]); setQuizTimeLeft(null);
    setClassElapsed(0); setShowRefreshReminder(false);
    setLeaderboard([]); setShowLeaderboard(false);
    setExitResponses([]); setShowExitSummary(false); setShowExitTicket(false);
    setShowProgress(false); setShowReminder(false);
  };

  const toggleMic = () => { localStream.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setMicActive(p => !p); };
  const toggleCam = () => { localStream.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setCamActive(p => !p); };
  const fetchLounges = async () => { try { const { data } = await supabase.from('active_lounges').select('*'); if (data) setLounges(data); } catch (e) { console.error(e); } };

  // ─── Bookmark / Poll handlers ─────────────────────────────────────────────

  const advanceBookmark = async () => {
    const nextNum = currentBookmark + 1;
    const pos: BookmarkPosition = { type: nextType, value: nextValue.trim(), label: `${TYPE_ICONS[nextType]} ${TYPE_LABELS[nextType]}: ${nextValue.trim()}` };
    try { await supabase.from('bookmarks').insert([{ lounge_id: currentLounge.id, bookmark_number: nextNum, timestamp: Date.now(), created_at: new Date().toISOString() }]); } catch {}
    sendSignal('bookmark-sync', { bookmark: nextNum, position: pos });
    setCurrentBookmark(nextNum); setCurrentPosition(pos);
    setBookmarkHistory(prev => [{ num: nextNum, pos }, ...prev]);
    setNextValue('');
    setPollActive(false); setPollComplete(false); setPollScore(null); setPollResponses({ yes: 0, no: 0 }); setPollResponseDetails([]);
  };

  const handleStartPoll = () => {
    if (!canRunPoll) return;
    setPollActive(true); setPollComplete(false); setPollResponses({ yes: 0, no: 0 }); setPollScore(null); setPollResponseDetails([]);
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
    sendSignal('poll-response', { peerId: myId, name: guestName || 'Student', understood });
  };

  // ─── Quiz handlers ─────────────────────────────────────────────────────────

  const openQuizCreator = (type: 'short' | 'long') => {
    setQuizCreatorType(type); setQuizTitle(''); setQuizSubject('general'); setQuizTimeLimit(5);
    setDraftQuestions([blankQuestion(1, false)]); setDraftQIdCounter(2); setShowQuizCreator(true);
  };

  const addDraftQuestion = () => {
    const id = draftQIdCounter; setDraftQIdCounter(p => p + 1);
    setDraftQuestions(prev => [...prev, blankQuestion(id, isStemSubject)]);
  };

  const removeDraftQuestion = (id: number) => setDraftQuestions(prev => prev.filter(q => q.id !== id));
  const updateDraftQuestion = (id: number, changes: Partial<QuizQuestion>) => setDraftQuestions(prev => prev.map(q => q.id === id ? { ...q, ...changes } : q));
  const updateDraftOption = (qId: number, idx: number, val: string) =>
    setDraftQuestions(prev => prev.map(q => { if (q.id !== qId) return q; const opts = [...q.options] as [string, string, string, string]; opts[idx] = val; return { ...q, options: opts }; }));

  const handleLaunchQuiz = async () => {
    if (!quizTitle.trim()) return alert('Please enter a quiz title.');
    if (draftQuestions.length === 0) return alert('Please add at least one question.');
    if (draftQuestions.some(q => !q.text.trim())) return alert('All questions must have text.');
    if (draftQuestions.some(q => q.type === 'mc' && q.options.some(o => !o.trim()))) return alert('Fill in all MC options.');

    const quiz: Quiz = { id: makeId(), type: quizCreatorType, title: quizTitle, subject: quizSubject, questions: draftQuestions, timeLimit: quizTimeLimit, bookmarkRef: currentBookmark, createdAt: new Date().toISOString() };

    if (quizCreatorType === 'long') {
      try {
        const { data } = await supabase.from('quizzes').insert([{ lounge_id: currentLounge.id, type: quiz.type, title: quiz.title, subject: quiz.subject, questions: quiz.questions, time_limit: quiz.timeLimit, bookmark_ref: quiz.bookmarkRef }]).select();
        if (data?.[0]?.id) quiz.id = data[0].id;
      } catch (e) { console.warn('Quiz DB:', (e as any)?.message); }
    }

    setActiveQuiz(quiz); setQuizSubmissions([]); setShowQuizCreator(false); setShowQuizResults(true);
    sendSignal('quiz-launch', { quiz });
    if (quizCreatorType === 'short') setQuizTimeLeft(quizTimeLimit * 60);
    if (quizCreatorType === 'long') { setReminderQuiz(quiz); setShowReminder(false); }
  };

  const handleStudentSubmitQuiz = (autoSubmit = false) => {
    if (studentQuizSubmitted) return;
    setStudentQuizSubmitted(true); setQuizTimeLeft(null);
    sendSignal('quiz-submit', { quizId: activeQuiz?.id, quizType: activeQuiz?.type, quiz: activeQuiz, studentName: guestName || 'Student', peerId: myId, answers: studentAnswers, diagramUrls: studentDiagramUrls });
    if (!autoSubmit) setShowQuizModal(false);
  };

  const handleEndQuiz = () => {
    sendSignal('quiz-end', {}); setShowQuizResults(false); setActiveQuiz(null); setQuizTimeLeft(null);
    if (reminderQuiz) setShowReminder(true); // show reminder generator after homework ends
  };

  // ─── Exit Ticket handlers ─────────────────────────────────────────────────

  const handleSendExitTicket = () => {
    setExitResponses([]); setShowExitSummary(true);
    sendSignal('exit-ticket-start', {});
  };

  const handleSubmitExitTicket = () => {
    if (!exitAnswer.rating) return alert('Please give a star rating.');
    setExitSubmitted(true);
    sendSignal('exit-ticket-submit', { studentName: guestName || 'Student', peerId: myId, mainIdea: exitAnswer.mainIdea, unclear: exitAnswer.unclear, rating: exitAnswer.rating });
  };

  const handleCloseExitTicket = () => {
    sendSignal('exit-ticket-end', {}); setShowExitSummary(false);
  };

  // ─── Other handlers ────────────────────────────────────────────────────────

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

  const handleBreak = async () => { try { await supabase.from('class_sessions').update({ status: 'on_break', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id); setSessionStatus('on_break'); } catch {} };
  const handleResume = async () => { try { await supabase.from('class_sessions').update({ status: 'active', last_updated: new Date().toISOString() }).eq('lounge_id', currentLounge.id); setSessionStatus('active'); } catch {} };
  const handleDeleteLounge = async (id: string) => { try { await supabase.from('active_lounges').delete().eq('id', id); await fetchLounges(); } catch {} };

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
    window.open(`https://wa.me/?text=${encodeURIComponent(`Join "${currentLounge?.lounge_name}" on Digital Lounge!\n\nEntry Code: *${c}*\n\nTap to join (no app needed):\n${window.location.origin}?code=${c}`)}`, '_blank');
  };
  const handleCopyLink = () => { navigator.clipboard.writeText(`${window.location.origin}?code=${generatedCode || currentLounge?.entry_code}`).then(() => alert('Link copied!')); };

  // ─── Progress Tracking data ────────────────────────────────────────────────

  const buildProgressData = () => {
    const registry = new Map<string, string>(); // peerId → name
    questions.forEach(q => { if (q.peer_id && q.user_name) registry.set(q.peer_id, q.user_name); });
    pollResponseDetails.forEach(r => registry.set(r.peerId, r.name));
    quizSubmissions.forEach(s => registry.set(s.peerId, s.studentName));
    exitResponses.forEach(r => { /* no peerId here but name */ });

    return Array.from(registry.entries()).map(([peerId, name]) => ({
      peerId, name,
      questionsAsked: questions.filter(q => q.peer_id === peerId).length,
      pollAnswered: pollResponseDetails.find(r => r.peerId === peerId),
      shortQuizScore: quizSubmissions.find(s => s.peerId === peerId && s.mcScore !== undefined)?.mcScore,
      homeworkDone: quizSubmissions.some(s => s.peerId === peerId && activeQuiz?.type === 'long'),
      exitDone: exitResponses.find(r => r.studentName === name),
      connected: connectedStudents.includes(peerId),
    }));
  };

  // ─── Reminder message generator ────────────────────────────────────────────

  const buildReminder = (quiz: Quiz, days: number) => {
    const code = generatedCode || currentLounge?.entry_code;
    const url = `${window.location.origin}?code=${code}`;
    if (days === 3) return `Hi! 📚 Reminder: Please complete your homework assignment "${quiz.title}" (${quiz.subject}) if you haven't yet.\n\nAsk questions by joining the lounge:\n${url} (Code: ${code})`;
    return `🔁 Review time! It's been a week since we covered "${quiz.title}". Revisit your notes and homework. Test yourself — can you explain the key ideas without looking?\n\nJoin lounge for questions: ${url} (Code: ${code})`;
  };

  // ─── LOBBY ─────────────────────────────────────────────────────────────────

  if (view === 'lobby') {
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h1>🎓 Digital Lounge</h1>
        <p style={{ color: '#666', marginTop: '-10px' }}>Students join via WhatsApp — no app needed</p>
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
          <input placeholder="Lounge Name" value={newLoungeName} onChange={e => setNewLoungeName(e.target.value)} style={iStyle} />
          <input placeholder="Your Name" value={newHostName} onChange={e => setNewHostName(e.target.value)} style={{ ...iStyle, marginBottom: '15px' }} />
          <button onClick={handleCreateLounge} style={bStyle('#000')}>Launch</button>
          <button onClick={() => setShowHostModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
        </Modal>}
        {showJoinModal && <Modal onClose={() => setShowJoinModal(false)} title="Join Lounge">
          <p style={{ color: '#666', fontSize: '13px', margin: '0 0 12px' }}>Have your content ready — the host will sync your position.</p>
          <input placeholder="Your Name" value={guestName} onChange={e => setGuestName(e.target.value)} style={iStyle} />
          <input placeholder="Entry Code" value={inputCode} onChange={e => setInputCode(e.target.value)} style={{ ...iStyle, fontSize: '20px', textAlign: 'center', letterSpacing: '4px', marginBottom: '15px' }} />
          <button onClick={handleJoinLounge} style={bStyle('#007bff')}>Join</button>
          <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>Cancel</button>
        </Modal>}
      </div>
    );
  }

  // ─── ROOM ──────────────────────────────────────────────────────────────────

  const code = generatedCode || currentLounge?.entry_code;
  const progressData = buildProgressData();
  const avgRating = exitResponses.length > 0 ? (exitResponses.reduce((s, r) => s + r.rating, 0) / exitResponses.length).toFixed(1) : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', background: '#f5f5f5' }}>

      {/* Header */}
      <header style={{ background: '#111', color: '#fff', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', gap: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
          <strong>{currentLounge?.lounge_name}</strong>
          <span style={{ color: '#aaa', fontSize: '12px' }}>Code: {code}</span>
          {isHost && <span style={{ background: '#28a745', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>HOST</span>}
          <span style={{ fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#aaa' }}>● {connectionStatus}</span>
          {isHost && sessionStatus === 'active' && (
            <span style={{ fontSize: '11px', color: showRefreshReminder ? '#ff9800' : '#888' }}>
              {showRefreshReminder ? '⏰ 35 min — Short Quiz time!' : `⏱ ${formatTime(classElapsed)}`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isHost && <>
            <button onClick={handleShareWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📲 WhatsApp</button>
            <button onClick={handleCopyLink} style={{ background: '#555', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>🔗 Link</button>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>⚡ Quiz</button>
            <button onClick={() => openQuizCreator('long')} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📚 HW</button>
            {sessionStatus === 'active' && <button onClick={handleSendExitTicket} style={{ background: '#e11d48', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>🎟 Exit Ticket</button>}
            <button onClick={() => setShowProgress(true)} style={{ background: '#0891b2', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>📊 Progress</button>
            {sessionStatus === 'not_started' && <button onClick={handleStartClass} style={{ background: '#28a745', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Start</button>}
            {sessionStatus === 'active' && <button onClick={handleBreak} style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Break</button>}
            {sessionStatus === 'on_break' && <button onClick={handleResume} style={{ background: '#2196f3', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Resume</button>}
          </>}
          <button onClick={() => setShowLeaderboard(true)} style={{ background: '#ca8a04', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>🏆 {leaderboard.length > 0 ? leaderboard[0].points : 0}pt</button>
          <button onClick={handleExit} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '4px 9px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Exit</button>
        </div>
      </header>

      {/* 35-min reminder banner */}
      {isHost && showRefreshReminder && (
        <div style={{ background: '#ff9800', color: '#fff', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: '13px' }}>
          <span><strong>⏰ 35 minutes elapsed</strong> — time for a Short Quiz refresher!</span>
          <div style={{ display: 'flex', gap: '7px' }}>
            <button onClick={() => openQuizCreator('short')} style={{ background: '#fff', color: '#ff9800', border: 'none', padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Launch Quiz</button>
            <button onClick={() => setShowRefreshReminder(false)} style={{ background: 'rgba(255,255,255,0.3)', color: '#fff', border: 'none', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left Panel */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* AV Strip */}
          <div style={{ background: '#1c1c1c', padding: '7px 10px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {isHost ? (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '140px', height: '88px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: camActive ? 'block' : 'none' }} />
                  {!camActive && <div style={{ width: '140px', height: '88px', borderRadius: '6px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '24px' }}>🎙️</span></div>}
                  <div style={{ position: 'absolute', bottom: '3px', left: '3px', display: 'flex', gap: '2px' }}>
                    <button onClick={toggleMic} style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '11px' }}>{micActive ? '🎙️' : '🔇'}</button>
                    <button onClick={toggleCam} style={{ background: camActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '3px', padding: '2px 4px', cursor: 'pointer', fontSize: '11px' }}>{camActive ? '📹' : '📷'}</button>
                  </div>
                  <span style={{ position: 'absolute', top: '2px', left: '3px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 3px', borderRadius: '3px' }}>You</span>
                </div>
                <div style={{ color: '#ccc', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 3px', color: '#fff', fontWeight: 'bold' }}>Students: {connectedStudents.length}</p>
                  {connectedStudents.length === 0 ? <span style={{ color: '#888' }}>Waiting...</span> :
                    connectedStudents.map((id, i) => <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#333', padding: '1px 7px', borderRadius: '20px', marginRight: '3px', fontSize: '11px' }}><span style={{ color: '#4caf50' }}>●</span> S{i + 1}</span>)}
                  {mediaError && <p style={{ color: '#ff9800', margin: '3px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            ) : (
              <>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <video ref={hostVideoRef} autoPlay playsInline style={{ width: '170px', height: '105px', borderRadius: '6px', background: '#333', objectFit: 'cover', display: hostStream ? 'block' : 'none' }} />
                  {!hostStream && <div style={{ width: '170px', height: '105px', borderRadius: '6px', background: '#333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><span style={{ fontSize: '20px' }}>📡</span><span style={{ color: '#888', fontSize: '11px' }}>{connectionStatus}</span></div>}
                  <span style={{ position: 'absolute', top: '2px', left: '3px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '9px', padding: '1px 3px', borderRadius: '3px' }}>{currentLounge?.host_name}</span>
                </div>
                <div>
                  <button onClick={toggleMic} style={{ background: micActive ? '#28a745' : '#dc3545', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', color: '#fff', fontWeight: 'bold' }}>{micActive ? '🎙️ On' : '🔇 Off'}</button>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: connectionStatus === 'Live (P2P)' ? '#4caf50' : '#888' }}>{connectionStatus === 'Live (P2P)' ? '✓ Connected' : connectionStatus}</p>
                  {!isHost && leaderboard.length > 0 && (() => { const me = leaderboard.find(e => e.peerId === myId); return me ? <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#ca8a04' }}>🏆 {me.points} pts · Rank #{leaderboard.findIndex(e => e.peerId === myId) + 1}</p> : null; })()}
                  {mediaError && <p style={{ color: '#ff9800', margin: '3px 0 0', fontSize: '11px' }}>⚠ {mediaError}</p>}
                </div>
              </>
            )}
          </div>

          {/* Scrollable main */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Bookmark */}
            <div style={{ background: '#1a1a2e', color: '#fff', borderRadius: '12px', padding: '15px 17px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', letterSpacing: '2px', color: '#7c83fd', fontWeight: 'bold' }}>BOOKMARK</span>
                <span style={{ fontSize: '34px', fontWeight: 'bold', lineHeight: 1 }}>#{currentBookmark}</span>
              </div>
              {currentPosition ? <>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{currentPosition.label}</p>
                {!isHost && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#aaa' }}>Navigate to this position in your content.</p>}
              </> : <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>{isHost ? 'Set the first Bookmark below to begin.' : 'Waiting for host to set the first Bookmark...'}</p>}
            </div>

            {/* Host controls */}
            {isHost && <>
              <div style={{ background: '#fff', borderRadius: '10px', padding: '11px 13px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ margin: '0 0 7px', fontWeight: 'bold', fontSize: '13px' }}>{currentBookmark === 0 ? '📍 Set First Bookmark' : `📍 Set Bookmark #${currentBookmark + 1}`}</p>
                <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
                  <select value={nextType} onChange={e => setNextType(e.target.value as BookmarkPosition['type'])} style={{ padding: '7px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>
                    <option value="video">▶ Video</option><option value="page">📖 Page</option><option value="chapter">📌 Chapter</option><option value="custom">📍 Custom</option>
                  </select>
                  <input value={nextValue} onChange={e => setNextValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && (currentBookmark === 0 ? nextValue.trim() && advanceBookmark() : canAdvance && advanceBookmark())} placeholder={TYPE_HINTS[nextType]} style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }} />
                </div>
              </div>

              {currentBookmark === 0 ? (
                <button onClick={() => nextValue.trim() && advanceBookmark()} disabled={!nextValue.trim()} style={{ width: '100%', padding: '10px', background: nextValue.trim() ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: nextValue.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px' }}>Set Bookmark #1 & Sync Students</button>
              ) : (
                <div style={{ background: '#fff', borderRadius: '10px', padding: '11px 13px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ margin: '0 0 9px', fontWeight: 'bold', fontSize: '13px' }}>Before Next Bookmark</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '7px' }}>
                    <span>{unansweredCount === 0 ? '✅' : '🔴'}</span>
                    <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 1 — Answer all questions</span>
                    {unansweredCount > 0 && <span style={{ background: '#dc3545', color: '#fff', borderRadius: '20px', padding: '1px 8px', fontSize: '12px', fontWeight: 'bold' }}>{unansweredCount}</span>}
                  </div>
                  <div style={{ marginBottom: '9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
                      <span>{pollComplete && (pollScore ?? 0) >= 80 ? '✅' : pollComplete ? '⚠️' : '⬜'}</span>
                      <span style={{ fontWeight: '600', fontSize: '13px' }}>Step 2 — Understanding poll ≥ 80%</span>
                    </div>
                    {!pollActive && !pollComplete && <button onClick={handleStartPoll} disabled={!canRunPoll} style={{ padding: '5px 13px', background: canRunPoll ? '#7c83fd' : '#ccc', color: '#fff', border: 'none', borderRadius: '6px', cursor: canRunPoll ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold' }}>🗳 Run Poll</button>}
                    {pollActive && (
                      <div style={{ background: '#f0f0ff', borderRadius: '8px', padding: '9px' }}>
                        <p style={{ margin: '0 0 5px', fontSize: '12px', fontWeight: 'bold' }}>Live — {totalPollResponses} responses</p>
                        <div style={{ display: 'flex', gap: '7px', marginBottom: '5px' }}>
                          <div style={{ flex: 1, background: '#d4edda', borderRadius: '5px', padding: '5px', textAlign: 'center' }}><strong style={{ color: '#155724' }}>✓ {pollResponses.yes}</strong></div>
                          <div style={{ flex: 1, background: '#f8d7da', borderRadius: '5px', padding: '5px', textAlign: 'center' }}><strong style={{ color: '#721c24' }}>✗ {pollResponses.no}</strong></div>
                        </div>
                        {totalPollResponses > 0 && <div style={{ background: '#e9ecef', borderRadius: '4px', height: '6px', marginBottom: '5px' }}><div style={{ background: '#28a745', height: '100%', borderRadius: '4px', width: `${Math.round((pollResponses.yes / totalPollResponses) * 100)}%`, transition: 'width 0.3s' }} /></div>}
                        <button onClick={handleClosePoll} style={{ padding: '4px 10px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>Close Poll</button>
                      </div>
                    )}
                    {pollComplete && pollScore !== null && (
                      <div style={{ background: pollScore >= 80 ? '#d4edda' : '#fff3cd', borderRadius: '8px', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span>{pollScore >= 80 ? '✅' : '⚠️'}</span>
                        <div style={{ flex: 1 }}>
                          <strong style={{ color: pollScore >= 80 ? '#155724' : '#856404' }}>{pollScore}% understood</strong>
                          <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#666' }}>{pollScore >= 80 ? 'Ready to advance!' : 'Consider re-teaching.'}</p>
                        </div>
                        {pollScore < 80 && <button onClick={handleStartPoll} style={{ padding: '3px 8px', background: '#7c83fd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Re-run</button>}
                      </div>
                    )}
                  </div>
                  <button onClick={advanceBookmark} disabled={!canAdvance} style={{ width: '100%', padding: '9px', background: canAdvance ? '#28a745' : '#ccc', color: '#fff', border: 'none', borderRadius: '8px', cursor: canAdvance ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '13px' }}>
                    {canAdvance ? `✓ Set Bookmark #${currentBookmark + 1}` : '🔒 Next Bookmark (complete steps above)'}
                  </button>
                </div>
              )}

              {bookmarkHistory.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '10px', padding: '9px 11px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ margin: '0 0 5px', fontWeight: 'bold', fontSize: '11px', color: '#888' }}>HISTORY</p>
                  {bookmarkHistory.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 0', borderBottom: i < bookmarkHistory.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <span style={{ background: i === 0 ? '#7c83fd' : '#eee', color: i === 0 ? '#fff' : '#555', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', fontWeight: 'bold' }}>#{b.num}</span>
                      <span style={{ fontSize: '12px', color: '#333' }}>{b.pos.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>}

            {/* Student: poll */}
            {!isHost && pollActive && (
              <div style={{ background: '#7c83fd', borderRadius: '12px', padding: '16px', color: '#fff', textAlign: 'center' }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8 }}>UNDERSTANDING CHECK</p>
                <p style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 'bold' }}>Do you understand this section?</p>
                {studentPollAnswer === null ? (
                  <div style={{ display: 'flex', gap: '9px', justifyContent: 'center' }}>
                    <button onClick={() => handlePollResponse(true)} style={{ flex: 1, maxWidth: '140px', padding: '10px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✓ Got it!</button>
                    <button onClick={() => handlePollResponse(false)} style={{ flex: 1, maxWidth: '140px', padding: '10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✗ Not yet</button>
                  </div>
                ) : <p style={{ margin: 0 }}>{studentPollAnswer ? '✓ Response sent — Got it!' : '✓ Response sent — Not yet.'}</p>}
              </div>
            )}

            {/* Student: Exit Ticket overlay */}
            {!isHost && showExitTicket && (
              <div style={{ background: '#e11d48', borderRadius: '12px', padding: '18px', color: '#fff' }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', letterSpacing: '2px', opacity: 0.8 }}>🎟 EXIT TICKET</p>
                <p style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 'bold' }}>Quick reflection before you leave</p>
                {!exitSubmitted ? <>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '4px' }}>In one sentence, what was the main idea today?</label>
                    <textarea value={exitAnswer.mainIdea} onChange={e => setExitAnswer(p => ({ ...p, mainIdea: e.target.value }))} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: 'none', fontSize: '13px', resize: 'none', height: '52px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '4px' }}>What is still unclear to you?</label>
                    <textarea value={exitAnswer.unclear} onChange={e => setExitAnswer(p => ({ ...p, unclear: e.target.value }))} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: 'none', fontSize: '13px', resize: 'none', height: '52px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', opacity: 0.85, display: 'block', marginBottom: '6px' }}>Rate today's class:</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => setExitAnswer(p => ({ ...p, rating: n }))} style={{ flex: 1, padding: '8px', background: exitAnswer.rating >= n ? '#fff' : 'rgba(255,255,255,0.2)', color: exitAnswer.rating >= n ? '#e11d48' : '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>★</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleSubmitExitTicket} style={{ width: '100%', padding: '10px', background: '#fff', color: '#e11d48', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Submit (+2 pts)</button>
                </> : <p style={{ textAlign: 'center', fontWeight: 'bold', margin: 0 }}>✓ Submitted! Thank you.</p>}
              </div>
            )}

            {/* Q&A */}
            <div style={{ background: '#fff', borderRadius: '10px', padding: '11px 13px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: '13px' }}>💬 Ask a Question <span style={{ fontWeight: 'normal', color: '#888', fontSize: '12px' }}>(BM#{currentBookmark}) · +3 pts</span></p>
              <textarea value={questionInput} onChange={e => setQuestionInput(e.target.value)} placeholder="Type your question here..." style={{ width: '100%', height: '55px', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', resize: 'none', boxSizing: 'border-box', fontSize: '13px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={handleSendQuestion} style={{ flex: 1, padding: '8px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>❓ Ask</button>
                <button onClick={handleShareFile} style={{ flex: 1, padding: '8px', background: '#007bff', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>📤 Share Link</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Questions sidebar */}
        <div style={{ width: '280px', flexShrink: 0, background: '#fff', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '9px 13px', borderBottom: '1px solid #eee' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>❓ Questions</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '9px 11px' }}>
            {currentBmQs.length > 0 && <>
              <p style={{ margin: '0 0 5px', fontSize: '11px', fontWeight: 'bold', color: '#7c83fd', letterSpacing: '1px' }}>BOOKMARK #{currentBookmark} · {unansweredCount} unanswered</p>
              {currentBmQs.map((q, i) => (
                <div key={i} style={{ padding: '8px', background: q.answered ? '#f0f9f0' : '#fff8e1', borderRadius: '8px', marginBottom: '6px', borderLeft: `3px solid ${q.answered ? '#28a745' : '#ff9800'}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 'bold', color: '#666' }}>{q.user_name}</p>
                  <p style={{ margin: '0 0 5px', fontSize: '12px' }}>{q.question_text}</p>
                  {isHost && !q.answered && <button onClick={() => q.id && handleAnswerQuestion(q.id)} style={{ padding: '2px 7px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Mark Answered</button>}
                  {q.answered && <span style={{ color: '#28a745', fontSize: '11px' }}>✓ Answered</span>}
                </div>
              ))}
            </>}
            {currentBmQs.length === 0 && <p style={{ color: '#bbb', fontSize: '12px', textAlign: 'center', margin: '14px 0' }}>No questions for BM#{currentBookmark}</p>}
            {sharedFiles.length > 0 && <>
              <p style={{ margin: '10px 0 4px', fontSize: '11px', fontWeight: 'bold', color: '#007bff', letterSpacing: '1px' }}>SHARED LINKS</p>
              {sharedFiles.map((f, i) => (
                <div key={i} style={{ padding: '6px', background: '#e8f4ff', borderRadius: '6px', marginBottom: '4px' }}>
                  <a href={f.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#0056b3', fontSize: '12px' }}>📄 {f.file_name}</a>
                  <br /><small style={{ color: '#888' }}>By {f.from_name}</small>
                </div>
              ))}
            </>}
            {pastQs.length > 0 && <>
              <p style={{ margin: '10px 0 4px', fontSize: '11px', fontWeight: 'bold', color: '#aaa', letterSpacing: '1px' }}>EARLIER ({pastQs.length})</p>
              {pastQs.map((q, i) => (
                <div key={i} style={{ padding: '6px', background: '#f9f9f9', borderRadius: '5px', marginBottom: '4px', borderLeft: '2px solid #ddd', opacity: 0.7 }}>
                  <p style={{ margin: '0 0 1px', fontSize: '10px', color: '#888' }}>BM#{q.bookmark_number} · {q.user_name}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>{q.question_text}</p>
                </div>
              ))}
            </>}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* Quiz Creator */}
      {showQuizCreator && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '680px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px' }}>{quizCreatorType === 'short' ? '⚡ Short Quiz — Refresher' : '📚 Long Quiz — Homework'}</h2>
              <button onClick={() => setShowQuizCreator(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            <div style={{ background: quizCreatorType === 'short' ? '#fff8e1' : '#f3e8ff', borderRadius: '8px', padding: '9px 13px', marginBottom: '14px', fontSize: '12px', color: '#555' }}>
              {quizCreatorType === 'short' ? '⚡ Quick refresher — MC questions are auto-graded (+10 pts per correct). Trigger every ~35 min.'
                : '📚 Conceptual homework — requires deep reasoning. For STEM, add Diagram or Derive/Prove questions. Students earn +5 pts for submitting. Use \\alpha, ^2, _2, \\sqrt etc. for formulas.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '160px' }}>
                <label style={lblStyle}>Quiz Title</label>
                <input value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder="e.g. Chapter 5 Refresher" style={{ width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              {quizCreatorType === 'long' && (
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={lblStyle}>Subject</label>
                  <select value={quizSubject} onChange={e => { setQuizSubject(e.target.value); if (STEM_SUBJECTS.includes(e.target.value)) setDraftQuestions(prev => prev.map(q => ({ ...q, requiresDiagram: true }))); }}
                    style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value="general">General</option><option value="physics">Physics</option><option value="chemistry">Chemistry</option>
                    <option value="biology">Biology</option><option value="maths">Mathematics</option><option value="geometry">Geometry</option>
                    <option value="trigonometry">Trigonometry</option><option value="engineering">Engineering</option>
                  </select>
                </div>
              )}
              {quizCreatorType === 'short' && (
                <div style={{ flex: 1, minWidth: '110px' }}>
                  <label style={lblStyle}>Time Limit</label>
                  <select value={quizTimeLimit} onChange={e => setQuizTimeLimit(Number(e.target.value))} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', boxSizing: 'border-box' }}>
                    <option value={3}>3 min</option><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option>
                  </select>
                </div>
              )}
            </div>
            {isStemSubject && <div style={{ background: '#fde8ff', borderRadius: '7px', padding: '7px 11px', marginBottom: '10px', fontSize: '12px', color: '#6d28d9' }}>📐 STEM subject — include at least one Diagram + Label or Derive/Prove question.</div>}
            <div style={{ marginBottom: '10px' }}>
              <p style={{ margin: '0 0 7px', fontWeight: 'bold', fontSize: '13px' }}>Questions ({draftQuestions.length})</p>
              {draftQuestions.map((q, qi) => (
                <div key={q.id} style={{ background: '#f8f8f8', borderRadius: '9px', padding: '11px', marginBottom: '9px', border: '1px solid #eee' }}>
                  <div style={{ display: 'flex', gap: '7px', alignItems: 'center', marginBottom: '7px', flexWrap: 'wrap' }}>
                    <span style={{ background: '#7c83fd', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 'bold' }}>Q{qi + 1}</span>
                    <select value={q.type} onChange={e => updateDraftQuestion(q.id, { type: e.target.value as QuizQuestion['type'] })} style={{ padding: '4px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '12px', cursor: 'pointer' }}>
                      {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: '#666', marginLeft: 'auto', cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.requiresDiagram} onChange={e => updateDraftQuestion(q.id, { requiresDiagram: e.target.checked })} /> Diagram
                    </label>
                    {draftQuestions.length > 1 && <button onClick={() => removeDraftQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '15px' }}>✕</button>}
                  </div>
                  <textarea value={q.text} onChange={e => updateDraftQuestion(q.id, { text: e.target.value })} placeholder={q.type === 'mc' ? 'Enter question...' : q.type === 'derive' ? 'e.g. Derive the expression for centripetal acceleration...' : q.type === 'diagram' ? 'e.g. Draw and label a diagram of the human heart...' : 'e.g. Explain why... / A student claims...'} style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', resize: 'vertical', minHeight: '52px', boxSizing: 'border-box', marginBottom: q.type === 'mc' ? '7px' : '0' }} />
                  {/* Preview parsed formula */}
                  {q.text && parseMath(q.text) !== q.text && <p style={{ margin: '3px 0 6px', fontSize: '12px', color: '#7c3aed', background: '#f3e8ff', padding: '3px 7px', borderRadius: '4px' }}>Preview: {parseMath(q.text)}</p>}
                  {q.type === 'mc' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <div key={letter} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span onClick={() => updateDraftQuestion(q.id, { correctOption: letter })} style={{ background: q.correctOption === letter ? '#28a745' : '#ddd', color: q.correctOption === letter ? '#fff' : '#555', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>{letter}</span>
                          <input value={q.options[idx]} onChange={e => updateDraftOption(q.id, idx, e.target.value)} placeholder={`Option ${letter}`} style={{ flex: 1, padding: '4px 7px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '12px' }} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addDraftQuestion} style={{ width: '100%', padding: '8px', background: '#f0f0f0', border: '1px dashed #ccc', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', color: '#555' }}>+ Add Question</button>
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={handleLaunchQuiz} style={{ flex: 1, padding: '11px', background: quizCreatorType === 'short' ? '#f59e0b' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                {quizCreatorType === 'short' ? '⚡ Launch Short Quiz' : '📚 Send as Homework'}
              </button>
              <button onClick={() => setShowQuizCreator(false)} style={{ padding: '11px 18px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Student Quiz Modal */}
      {showQuizModal && activeQuiz && !isHost && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '600px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '7px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '11px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', fontWeight: 'bold' }}>{activeQuiz.type === 'short' ? '⚡ SHORT QUIZ' : '📚 HOMEWORK'}</p>
                <h2 style={{ margin: 0, fontSize: '17px' }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? '#dc3545' : '#333', color: '#fff', padding: '7px 12px', borderRadius: '8px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px' }}>TIME</p>
                  <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            {activeQuiz.type === 'long' && <div style={{ background: '#f3e8ff', borderRadius: '7px', padding: '7px 11px', marginBottom: '12px', fontSize: '12px', color: '#6d28d9' }}>Show your reasoning. For diagrams: draw on paper → photo → upload to imgur.com → paste URL here.</div>}
            <div style={{ marginBottom: '14px', maxHeight: '55vh', overflowY: 'auto' }}>
              {activeQuiz.questions.map((q, i) => (
                <div key={q.id} style={{ background: '#f8f8f8', borderRadius: '9px', padding: '12px', marginBottom: '10px' }}>
                  <p style={{ margin: '0 0 9px', fontWeight: 'bold', fontSize: '14px' }}>Q{i + 1}. {parseMath(q.text)}</p>
                  {q.type === 'mc' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                        <label key={letter} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', padding: '7px 9px', borderRadius: '6px', background: studentAnswers[q.id] === letter ? '#e0e7ff' : '#fff', border: `1px solid ${studentAnswers[q.id] === letter ? '#7c83fd' : '#ddd'}` }}>
                          <input type="radio" name={`q-${q.id}`} value={letter} checked={studentAnswers[q.id] === letter} onChange={() => setStudentAnswers(prev => ({ ...prev, [q.id]: letter }))} disabled={studentQuizSubmitted} />
                          <span style={{ fontSize: '13px' }}><strong>{letter}.</strong> {parseMath(q.options[idx])}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {(q.type === 'short' || q.type === 'long' || q.type === 'derive') && (
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted}
                      placeholder={q.type === 'derive' ? 'Show all working. State assumptions. Derive step by step...' : 'Write your detailed answer with reasoning...'}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical', minHeight: q.type === 'long' || q.type === 'derive' ? '110px' : '65px', fontSize: '13px', boxSizing: 'border-box' }} />
                  )}
                  {q.type === 'diagram' && <>
                    <textarea value={studentAnswers[q.id] || ''} onChange={e => setStudentAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="Describe your diagram (labels, annotations, key features)..." style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ddd', resize: 'vertical', minHeight: '70px', fontSize: '13px', boxSizing: 'border-box', marginBottom: '7px' }} />
                    <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Paste diagram image URL (imgur.com, etc.)" style={{ width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #6d28d9', fontSize: '12px', boxSizing: 'border-box', color: '#6d28d9' }} />
                  </>}
                  {q.requiresDiagram && q.type !== 'diagram' && (
                    <input value={studentDiagramUrls[q.id] || ''} onChange={e => setStudentDiagramUrls(prev => ({ ...prev, [q.id]: e.target.value }))} disabled={studentQuizSubmitted} placeholder="📐 Diagram URL (optional but recommended)" style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px dashed #6d28d9', fontSize: '12px', boxSizing: 'border-box', color: '#6d28d9', marginTop: '7px' }} />
                  )}
                </div>
              ))}
            </div>
            {!studentQuizSubmitted
              ? <button onClick={() => handleStudentSubmitQuiz(false)} style={{ width: '100%', padding: '11px', background: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                {activeQuiz.type === 'short' ? '⚡ Submit Quiz' : '📚 Submit Homework (+5 pts)'}
              </button>
              : <div style={{ background: '#d4edda', borderRadius: '8px', padding: '11px', textAlign: 'center' }}><p style={{ margin: 0, color: '#155724', fontWeight: 'bold' }}>✓ Submitted! Points awarded.</p></div>}
          </div>
        </Overlay>
      )}

      {/* Host Quiz Results */}
      {showQuizResults && activeQuiz && isHost && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '700px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ margin: '0 0 2px', fontSize: '11px', letterSpacing: '2px', color: activeQuiz.type === 'short' ? '#f59e0b' : '#7c3aed', fontWeight: 'bold' }}>{activeQuiz.type === 'short' ? '⚡ SHORT QUIZ RESULTS' : '📚 HOMEWORK RESULTS'}</p>
                <h2 style={{ margin: 0, fontSize: '17px' }}>{activeQuiz.title}</h2>
              </div>
              {activeQuiz.type === 'short' && quizTimeLeft !== null && (
                <div style={{ background: quizTimeLeft < 60 ? '#dc3545' : '#333', color: '#fff', padding: '7px 12px', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10px', letterSpacing: '1px' }}>TIME LEFT</p>
                  <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTime(quizTimeLeft)}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '9px', marginBottom: '14px' }}>
              <div style={{ flex: 1, background: '#f0f0f0', borderRadius: '7px', padding: '9px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold' }}>{quizSubmissions.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Submitted</p>
              </div>
              {activeQuiz.questions.some(q => q.type === 'mc') && quizSubmissions.length > 0 && (
                <div style={{ flex: 1, background: '#e8f5e9', borderRadius: '7px', padding: '9px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#2e7d32' }}>
                    {Math.round(quizSubmissions.reduce((s, sub) => s + (sub.mcScore ?? 0), 0) / quizSubmissions.length)}%
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Avg MC Score</p>
                </div>
              )}
              <div style={{ flex: 1, background: '#fff3e0', borderRadius: '7px', padding: '9px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#e65100' }}>{connectedStudents.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Connected</p>
              </div>
            </div>
            <div style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '12px' }}>
              {quizSubmissions.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: '18px' }}>Waiting for submissions...</p> :
                quizSubmissions.map((sub, i) => (
                  <div key={i} style={{ background: '#f8f8f8', borderRadius: '9px', padding: '11px', marginBottom: '7px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                      <strong>{sub.studentName}</strong>
                      {sub.mcScore !== undefined && <span style={{ background: sub.mcScore >= 80 ? '#d4edda' : sub.mcScore >= 60 ? '#fff3cd' : '#f8d7da', color: sub.mcScore >= 80 ? '#155724' : sub.mcScore >= 60 ? '#856404' : '#721c24', padding: '2px 9px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>MC: {sub.mcScore}%</span>}
                    </div>
                    {activeQuiz.questions.map((q, qi) => (
                      <div key={q.id} style={{ marginBottom: '5px', paddingBottom: '5px', borderBottom: qi < activeQuiz.questions.length - 1 ? '1px solid #eee' : 'none' }}>
                        <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>Q{qi + 1}: {parseMath(q.text).substring(0, 60)}{q.text.length > 60 ? '...' : ''}</p>
                        {q.type === 'mc' && <p style={{ margin: 0, fontSize: '12px', color: sub.answers[q.id] === q.correctOption ? '#28a745' : '#dc3545' }}>{sub.answers[q.id] === q.correctOption ? '✓' : '✗'} {sub.answers[q.id] || 'N/A'}{sub.answers[q.id] !== q.correctOption && <span style={{ color: '#888' }}> (✓{q.correctOption})</span>}</p>}
                        {q.type !== 'mc' && <p style={{ margin: 0, fontSize: '12px', color: '#333', background: '#fff', padding: '4px 7px', borderRadius: '4px', border: '1px solid #eee' }}>{sub.answers[q.id] || <em style={{ color: '#aaa' }}>No answer</em>}</p>}
                        {sub.diagramUrls[q.id] && <a href={sub.diagramUrls[q.id]} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#6d28d9', display: 'block', marginTop: '3px' }}>📐 View Diagram</a>}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '9px' }}>
              <button onClick={handleEndQuiz} style={{ flex: 1, padding: '10px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>End Quiz</button>
              {activeQuiz.type === 'long' && <button onClick={() => setShowReminder(true)} style={{ flex: 1, padding: '10px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>📅 Reminders</button>}
              <button onClick={() => setShowQuizResults(false)} style={{ padding: '10px 16px', background: '#f0f0f0', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Exit Ticket Summary (host) */}
      {showExitSummary && isHost && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '580px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px' }}>🎟 Exit Ticket Results</h2>
              <button onClick={handleCloseExitTicket} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '9px', marginBottom: '14px' }}>
              <div style={{ flex: 1, background: '#fce7f3', borderRadius: '7px', padding: '9px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#be185d' }}>{exitResponses.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Responses</p>
              </div>
              {avgRating && <div style={{ flex: 1, background: '#fef9c3', borderRadius: '7px', padding: '9px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#ca8a04' }}>{'★'.repeat(Math.round(Number(avgRating)))} {avgRating}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Avg Rating</p>
              </div>}
            </div>
            {exitResponses.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: '18px' }}>Waiting for student responses...</p> : (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: '12px', color: '#555' }}>💡 MAIN IDEAS (what students retained)</p>
                  {exitResponses.filter(r => r.mainIdea).map((r, i) => (
                    <div key={i} style={{ background: '#f0fdf4', borderRadius: '6px', padding: '7px 10px', marginBottom: '4px', fontSize: '13px' }}>
                      <strong style={{ fontSize: '11px', color: '#16a34a' }}>{r.studentName}</strong> {r.rating > 0 && <span>{'★'.repeat(r.rating)}</span>}<br />{r.mainIdea}
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: '12px', color: '#555' }}>❓ STILL UNCLEAR (plan your next class from this)</p>
                  {exitResponses.filter(r => r.unclear).map((r, i) => (
                    <div key={i} style={{ background: '#fef2f2', borderRadius: '6px', padding: '7px 10px', marginBottom: '4px', fontSize: '13px' }}>
                      <strong style={{ fontSize: '11px', color: '#dc2626' }}>{r.studentName}</strong><br />{r.unclear}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Overlay>
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '460px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px' }}>🏆 Class Leaderboard</h2>
              <button onClick={() => setShowLeaderboard(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#92400e' }}>
              Points: Poll +2 · Question +3 · MC correct +10 · Homework +5 · Exit Ticket +2
            </div>
            {leaderboard.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: '18px' }}>No points earned yet — participate to appear here!</p> : (
              leaderboard.map((e, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const isMe = e.peerId === myId;
                return (
                  <div key={e.peerId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isMe ? '#fffbeb' : i < 3 ? '#fafafa' : '#fff', borderRadius: '8px', marginBottom: '5px', border: isMe ? '2px solid #ca8a04' : '1px solid #eee' }}>
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>{medals[i] ?? `${i + 1}.`}</span>
                    <span style={{ flex: 1, fontWeight: isMe ? 'bold' : 'normal' }}>{e.name} {isMe && '(you)'}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#ca8a04' }}>{e.points} pts</span>
                  </div>
                );
              })
            )}
          </div>
        </Overlay>
      )}

      {/* Progress Tracking Modal */}
      {showProgress && isHost && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '680px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '17px' }}>📊 Student Progress — This Session</h2>
              <button onClick={() => setShowProgress(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            {progressData.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center', padding: '18px' }}>No student activity recorded yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Connected</th>
                      <th style={thStyle}>Questions</th>
                      <th style={thStyle}>Poll</th>
                      <th style={thStyle}>Quiz Score</th>
                      <th style={thStyle}>Homework</th>
                      <th style={thStyle}>Exit Ticket</th>
                      <th style={thStyle}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progressData.map((s, i) => {
                      const lb = leaderboard.find(e => e.peerId === s.peerId);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={tdStyle}><strong>{s.name}</strong></td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.connected ? '✅' : '⬛'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.questionsAsked > 0 ? `${s.questionsAsked} ❓` : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.pollAnswered ? (s.pollAnswered.understood ? '✓ Got it' : '✗ Not yet') : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.shortQuizScore !== undefined ? `${s.shortQuizScore}%` : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.homeworkDone ? '✅' : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{s.exitDone ? `★${s.exitDone.rating}` : '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold', color: '#ca8a04' }}>{lb?.points ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Overlay>
      )}

      {/* Spaced Repetition Reminder Modal */}
      {showReminder && reminderQuiz && isHost && (
        <Overlay>
          <div style={{ background: '#fff', borderRadius: '14px', width: '560px', maxWidth: '96vw', padding: '22px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '17px' }}>📅 Spaced Repetition Reminders</h2>
              <button onClick={() => setShowReminder(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}>✕</button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#666' }}>Send these WhatsApp messages on Day 3 and Day 7 to reinforce learning. Tap to open WhatsApp or copy the message.</p>
            {[3, 7].map(days => (
              <div key={days} style={{ background: '#f0fdf4', borderRadius: '9px', padding: '12px', marginBottom: '12px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: '13px', color: '#166534' }}>📬 Day {days} Reminder — {days === 3 ? 'Completion nudge' : 'Spaced review'}</p>
                <p style={{ margin: '0 0 9px', fontSize: '12px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #d1fae5', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{buildReminder(reminderQuiz, days)}</p>
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button onClick={() => navigator.clipboard.writeText(buildReminder(reminderQuiz, days)).then(() => alert('Copied!'))} style={{ flex: 1, padding: '7px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📋 Copy</button>
                  <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(buildReminder(reminderQuiz, days))}`, '_blank')} style={{ flex: 1, padding: '7px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>📲 WhatsApp</button>
                </div>
              </div>
            ))}
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2000, overflowY: 'auto', padding: '20px 0' }}>{children}</div>;
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', padding: '26px', borderRadius: '12px', width: '350px', maxWidth: '94vw' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>{children}
      </div>
    </div>
  );
}

const iStyle: React.CSSProperties = { width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ccc', fontSize: '14px' };
const bStyle = (bg: string): React.CSSProperties => ({ width: '100%', padding: '10px', background: bg, color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold', marginBottom: '10px', fontSize: '14px' });
const lblStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 'bold', color: '#555', display: 'block', marginBottom: '4px' };
const thStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', fontSize: '12px', color: '#555' };
const tdStyle: React.CSSProperties = { padding: '8px 10px' };
