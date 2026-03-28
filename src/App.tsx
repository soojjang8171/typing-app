/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import { db } from './firebase';
import { Room, Participant } from './types';
import { cn } from './lib/utils';
import { 
  Trophy, 
  Users, 
  User as UserIcon,
  Timer, 
  Send, 
  Plus, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Keyboard,
  LogOut,
  Crown,
  Copy,
  ExternalLink,
  Sparkles,
  Stars,
  Heart,
  Gamepad2,
  MousePointer2,
  Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Helper Functions ---

function generateUserId(): string {
  return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function getOrCreateUserId(): string {
  const existing = localStorage.getItem('typing_app_user_id');
  if (existing) return existing;
  const newId = generateUserId();
  localStorage.setItem('typing_app_user_id', newId);
  return newId;
}

const currentUserId = getOrCreateUserId();

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUserId,
      email: null,
      emailVerified: false,
      isAnonymous: false,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "알 수 없는 오류가 발생했습니다.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error && parsed.error.includes('Missing or insufficient permissions')) {
          errorMessage = "권한이 부족합니다. 방 번호를 확인하거나 다시 시도해 주세요.";
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-rose-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-rose-100 text-center">
            <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">오류가 발생했습니다</h2>
            <p className="text-zinc-600 mb-6">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} variant="danger" className="w-full">
              페이지 새로고침
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const Header = ({ onBack }: { onBack?: () => void }) => (
  <header className="border-b border-zinc-100 bg-white sticky top-0 z-10 shadow-sm">
    <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-pastel-purple rounded-xl flex items-center justify-center text-white shadow-lg shadow-pastel-purple/20">
          <Sparkles size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-800 tracking-tight flex items-center gap-2">
            타자 마스터 ✨
          </h1>
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Typing Adventure</p>
        </div>
      </div>
    </div>
  </header>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-200/20 overflow-hidden transition-all duration-300", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) => {
  const variants = {
    primary: 'bg-pastel-purple text-white hover:brightness-95 shadow-lg shadow-pastel-purple/10',
    secondary: 'bg-pastel-blue text-white hover:brightness-95 shadow-lg shadow-pastel-blue/10',
    outline: 'bg-zinc-50 text-zinc-600 border border-zinc-100 hover:bg-zinc-100',
    danger: 'bg-rose-400 text-white hover:bg-rose-500 shadow-lg shadow-rose-100',
    coral: 'bg-pastel-coral text-white hover:brightness-95 shadow-lg shadow-pastel-coral/20'
  };

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-8 py-4 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-lg",
        variants[variant as keyof typeof variants] || variants.primary,
        className
      )}
    >
      {children}
    </motion.button>
  );
};

const Input = ({ 
  value, 
  onChange, 
  placeholder, 
  className,
  autoFocus,
  onKeyDown
}: { 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) => (
  <input
    type="text"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    autoFocus={autoFocus}
    onKeyDown={onKeyDown}
    className={cn(
      "w-full px-6 py-4 rounded-2xl border border-zinc-100 bg-zinc-50 focus:outline-none focus:border-pastel-purple focus:bg-white transition-all font-bold text-zinc-800 text-lg",
      className
    )}
  />
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'landing' | 'teacher' | 'student' | 'room'>('landing');
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Game state
  const [currentInput, setCurrentInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const copyRoomLink = () => {
    const url = `${window.location.origin}?room=${room?.id}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  useEffect(() => {
    // Check for room code in URL for auto-join
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    const viewFromUrl = params.get('view');

    if (roomFromUrl && view === 'landing') {
      setRoomCode(roomFromUrl);
      setView('student');
    } else if (viewFromUrl === 'student' && view === 'landing') {
      setView('student');
    }
  }, []);

  useEffect(() => {
    if (!room) return;

    const unsubscribe = onSnapshot(
      collection(db, 'rooms', room.id, 'participants'),
      (snapshot) => {
        const pList = snapshot.docs.map(doc => doc.data() as Participant);
        setParticipants(
          pList.sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            const aCorrectAt = a.lastCorrectAt ?? Number.MAX_SAFE_INTEGER;
            const bCorrectAt = b.lastCorrectAt ?? Number.MAX_SAFE_INTEGER;
            if (aCorrectAt !== bCorrectAt) return aCorrectAt - bCorrectAt;
            return a.lastUpdated - b.lastUpdated;
          })
        );
        
        if (user) {
          const me = pList.find(p => p.id === user.uid);
          if (me) setMyParticipant(me);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `rooms/${room.id}/participants`)
    );

    const unsubscribeRoom = onSnapshot(doc(db, 'rooms', room.id), (snapshot) => {
      if (snapshot.exists()) {
        const roomData = snapshot.data() as Room;
        setRoom(roomData);
        
        if (roomData.status === 'playing' && roomData.wordStartTime) {
          const now = Date.now();
          const msLeft = roomData.durationPerWord * 1000 - (now - roomData.wordStartTime);
          const remaining = Math.max(0, Math.ceil(msLeft / 1000));
          setTimeLeft(remaining);
        }
      } else {
        setRoom(null);
        setView('landing');
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `rooms/${room.id}`));

    return () => {
      unsubscribe();
      unsubscribeRoom();
    };
  }, [room?.id, user?.uid]);

  // Timer logic
  useEffect(() => {
    if (room?.status !== 'playing' || !room.wordStartTime) return;

    let advanced = false;
    const tick = () => {
      const msLeft = room.durationPerWord * 1000 - (Date.now() - room.wordStartTime!);
      const remaining = Math.max(0, Math.ceil(msLeft / 1000));
      setTimeLeft(remaining);

      // Advance exactly when the 5-second window ends.
      if (msLeft <= 0 && isTeacher && !advanced) {
        advanced = true;
        handleNextWord();
      }
    };

    tick();
    const timer = setInterval(tick, 100);

    return () => clearInterval(timer);
  }, [room?.status, room?.wordStartTime, room?.currentWordIndex, room?.durationPerWord, isTeacher]);

  const handleNextWord = async () => {
    if (!room || !isTeacher) return;

    const nextIndex = room.currentWordIndex + 1;
    try {
      if (nextIndex < room.words.length) {
        await updateDoc(doc(db, 'rooms', room.id), {
          currentWordIndex: nextIndex,
          wordStartTime: Date.now()
        });
      } else {
        await updateDoc(doc(db, 'rooms', room.id), {
          status: 'finished'
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const createRoom = async (words: string[], duration: number) => {
    try {
      setLoading(true);
      setError(null);
      
      // Robust 6-digit numeric ID generation
      const chars = '0123456789';
      let newRoomId = '';
      for (let i = 0; i < 6; i++) {
        newRoomId += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const newRoom: Room = {
        id: newRoomId,
        teacherId: currentUserId,
        status: 'waiting',
        words,
        currentWordIndex: 0,
        wordStartTime: null,
        durationPerWord: duration,
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'rooms', newRoomId), newRoom);
      setRoom(newRoom);
      setIsTeacher(true);
      setView('room');

      // Open student view in a new window for testing
      const studentUrl = `${window.location.origin}?view=student&room=${newRoomId}`;
      window.open(studentUrl, '_blank');
    } catch (err) {
      console.error('Room Creation Error:', err);
      let msg = '방을 생성하는 중 오류가 발생했습니다.';
      if (err instanceof Error) {
        if (err.message.includes('permission')) {
          msg = '방을 생성할 권한이 없습니다. 잠시 후 다시 시도해 주세요.';
        } else {
          msg += ` (${err.message})`;
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (code: string, name: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const trimmedCode = code.trim().toUpperCase();
      
      const roomRef = doc(db, 'rooms', trimmedCode);
      let roomSnap;
      try {
        roomSnap = await getDoc(roomRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `rooms/${trimmedCode}`);
        return;
      }

      if (!roomSnap.exists()) {
        setError('존재하지 않는 방 번호입니다.');
        return;
      }

      const roomData = roomSnap.data() as Room;
      if (roomData.status !== 'waiting') {
        setError('이미 게임이 시작되었거나 종료된 방입니다.');
        return;
      }

      const participant: Participant = {
        id: currentUserId,
        name,
        roomId: trimmedCode,
        scores: {},
        totalScore: 0,
        lastUpdated: Date.now(),
      };

      try {
        await setDoc(doc(db, 'rooms', trimmedCode, 'participants', currentUserId), participant);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `rooms/${trimmedCode}/participants/${currentUserId}`);
      }
      setRoom(roomData);
      setIsTeacher(false);
      setPlayerName(name);
      setView('room');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Firestore Error')) throw err;
      setError('방에 입장하는 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startGame = async () => {
    if (!room || !isTeacher) return;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        status: 'playing',
        currentWordIndex: 0,
        wordStartTime: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const submitTyping = async () => {
    if (!room || !myParticipant || room.status !== 'playing') return null;

    const currentWord = room.words[room.currentWordIndex];
    const isCorrect = currentInput.trim() === currentWord.trim();
    const accuracy = isCorrect ? 100 : 0;
    
    // If already completed this word correctly, don't resubmit
    if (myParticipant.scores[room.currentWordIndex]?.accuracy === 100) return 'already_done';

    const now = Date.now();
    const timeTaken = now - (room.wordStartTime || now);

    const newScores = {
      ...myParticipant.scores,
      [room.currentWordIndex]: {
        time: timeTaken,
        accuracy,
        completed: true
      }
    };

    // Calculate total score: 1 point per correct word
    const newTotalScore = Object.values(newScores).filter((s: any) => s.accuracy === 100).length;
    const isNewCorrect = isCorrect && !myParticipant.scores[room.currentWordIndex]?.accuracy;

    try {
      await updateDoc(doc(db, 'rooms', room.id, 'participants', myParticipant.id), {
        scores: newScores,
        totalScore: newTotalScore,
        lastUpdated: now,
        ...(isNewCorrect ? { lastCorrectAt: now } : {})
      });
      setCurrentInput('');
      return isCorrect ? 'correct' : 'wrong';
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}/participants/${myParticipant.id}`);
      return 'error';
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#FFF9F9] text-zinc-900 font-sans selection:bg-pastel-pink/30 selection:text-zinc-900 relative antialiased">
        {/* Background Decorations */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
          <motion.div animate={{ y: [0, 30, 0], rotate: [0, 10, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute top-[10%] left-[5%] text-6xl">🎈</motion.div>
          <motion.div animate={{ y: [0, -30, 0], rotate: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-[15%] right-[8%] text-6xl">🌈</motion.div>
          <motion.div animate={{ x: [0, 25, 0], scale: [1, 1.1, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 2 }} className="absolute top-[40%] left-[12%] text-5xl">✨</motion.div>
          <motion.div animate={{ x: [0, -25, 0], scale: [1, 1.2, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 3 }} className="absolute bottom-[40%] right-[15%] text-5xl">🍭</motion.div>
          <motion.div animate={{ y: [0, 20, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 4 }} className="absolute top-[70%] left-[20%] text-4xl">🐥</motion.div>
          <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 5 }} className="absolute top-[20%] right-[25%] text-4xl">🌸</motion.div>
        </div>

        <Header />

        <main className="max-w-7xl mx-auto px-6 py-12 relative z-1">
          <AnimatePresence mode="wait">
            {view === 'landing' && (
              <motion.div 
                key="landing"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="grid md:grid-cols-2 gap-8 py-12"
              >
              <Card className="p-10 flex flex-col items-center text-center gap-8 group hover:border-pastel-purple hover:shadow-2xl hover:shadow-pastel-purple/10 transition-all">
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-24 h-24 bg-pastel-purple text-white rounded-[32px] flex items-center justify-center shadow-xl shadow-pastel-purple/30"
                  >
                    <Crown size={48} />
                  </motion.div>
                  <div>
                    <h2 className="text-4xl font-black mb-3">선생님 👑</h2>
                    <p className="text-zinc-500 font-bold text-lg">새로운 타자 대회를 만들고<br/>학생들을 초대하세요! ✨</p>
                  </div>
                  <Button 
                    onClick={() => setView('teacher')} 
                    className="w-full h-16 text-xl font-black rounded-3xl bg-pastel-purple hover:brightness-95 text-white border-none shadow-xl shadow-pastel-purple/20"
                  >
                    방 만들기 🎈
                  </Button>
                </Card>

              <Card className="p-10 flex flex-col items-center text-center gap-8 group hover:border-pastel-coral hover:shadow-2xl hover:shadow-pastel-coral/10 transition-all">
                  <motion.div 
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    className="w-24 h-24 bg-pastel-coral text-white rounded-[32px] flex items-center justify-center shadow-xl shadow-pastel-coral/30"
                  >
                    <Gamepad2 size={48} />
                  </motion.div>
                  <div>
                    <h2 className="text-4xl font-black mb-3">학생 🎮</h2>
                    <p className="text-zinc-500 font-bold text-lg">선생님이 알려준 방 번호로<br/>입장하여 실력을 뽐내세요! 🚀</p>
                  </div>
                  <Button 
                    onClick={() => setView('student')} 
                    className="w-full h-16 text-xl font-black rounded-3xl bg-pastel-coral hover:brightness-95 text-white border-none shadow-xl shadow-pastel-coral/20"
                  >
                    참여하기 🌈
                  </Button>
                </Card>
              </motion.div>
            )}

            {view === 'teacher' && (
              <TeacherSetup onCreate={createRoom} onBack={() => setView('landing')} error={error} />
            )}

            {view === 'student' && (
              <StudentJoin onJoin={joinRoom} onBack={() => setView('landing')} error={error} initialCode={roomCode} />
            )}

            {view === 'room' && room && (
              <RoomView 
                room={room} 
                participants={participants} 
                isTeacher={isTeacher}
                playerName={playerName}
                timeLeft={timeLeft}
                currentInput={currentInput}
                setCurrentInput={setCurrentInput}
                onStart={startGame}
                onSubmit={async () => {
                  const result = await submitTyping();
                  return result;
                }}
                myParticipant={myParticipant}
                onCopyLink={copyRoomLink}
                copySuccess={copySuccess}
                onLeave={async () => {
                  if (isTeacher && room) {
                    try {
                      await deleteDoc(doc(db, 'rooms', room.id));
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  setRoom(null);
                  setView('landing');
                }}
              />
            )}
          </AnimatePresence>
        </main>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-views ---

function TeacherSetup({ onCreate, onBack, error }: { onCreate: (words: string[], duration: number) => void, onBack: () => void, error: string | null }) {
  const [wordsInput, setWordsInput] = useState('');
  const [duration, setDuration] = useState(5);
  const [theme, setTheme] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGeneratedWords, setHasGeneratedWords] = useState(false);

  const normalizeGeneratedWords = (raw: string, topic: string) => {
    const unique = new Set<string>();
    const cleaned = raw
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .map((line) => line.replace(/^(\d+[\).\-\s]+|[-*]\s*)/, ''))
      .map((line) => line.replace(/^["'`]+|["'`]+$/g, ''))
      .filter((line) => line.length > 0);

    for (const word of cleaned) {
      if (!unique.has(word)) unique.add(word);
      if (unique.size >= 20) break;
    }

    const words = Array.from(unique);
    while (words.length < 20) words.push(`${topic} ${words.length + 1}`);
    return words.slice(0, 20);
  };

  const getFallbackWords = (topic: string) => {
    const presets: Record<string, string[]> = {
      '동물': ['강아지', '고양이', '사자', '호랑이', '코끼리', '기린', '하마', '얼룩말', '토끼', '다람쥐', '곰', '늑대', '여우', '판다', '펭귄', '독수리', '돌고래', '고래', '문어', '나비'],
      '과일': ['사과', '배', '바나나', '딸기', '포도', '수박', '참외', '복숭아', '자두', '체리', '귤', '오렌지', '망고', '파인애플', '키위', '레몬', '블루베리', '라즈베리', '감', '멜론'],
      '채소': ['상추', '배추', '양배추', '오이', '당근', '감자', '고구마', '양파', '대파', '마늘', '토마토', '브로콜리', '파프리카', '가지', '호박', '무', '콩나물', '시금치', '버섯', '옥수수'],
      '학교': ['교실', '칠판', '연필', '지우개', '공책', '책상', '의자', '가방', '도서관', '운동장', '시험', '숙제', '수업', '선생님', '친구', '급식', '종례', '방학', '발표', '미술'],
      '우주': ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성', '태양', '달', '별', '은하', '은하수', '성운', '블랙홀', '혜성', '유성', '소행성', '우주선', '로켓'],
      '속담': ['가는 말이 고와야 오는 말이 곱다', '백지장도 맞들면 낫다', '티끌 모아 태산', '낮말은 새가 듣고 밤말은 쥐가 듣는다', '원숭이도 나무에서 떨어진다', '등잔 밑이 어둡다', '고래 싸움에 새우 등 터진다', '세 살 버릇 여든까지 간다', '콩 심은 데 콩 나고 팥 심은 데 팥 난다', '말 한마디에 천 냥 빚도 갚는다', '우물 안 개구리', '호랑이도 제 말 하면 온다', '돌다리도 두들겨 보고 건너라', '시작이 반이다', '웃는 얼굴에 침 못 뱉는다', '배보다 배꼽이 더 크다', '금강산도 식후경', '열 번 찍어 안 넘어가는 나무 없다', '개구리 올챙이 적 생각 못 한다', '하늘의 별 따기'],
    };

    const normalized = topic.trim().toLowerCase();
    const found =
      presets[topic.trim()] ||
      Object.entries(presets).find(([k]) => normalized.includes(k.toLowerCase()))?.[1];

    if (found) {
      const shuffled = [...found].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, 20);
    }
    return Array.from({ length: 20 }, (_, i) => `${topic} ${i + 1}`);
  };

  const generateWords = async () => {
    const topic = theme.trim();
    if (!topic) return;
    setIsGenerating(true);
    setHasGeneratedWords(false);
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        setWordsInput(getFallbackWords(topic).join('\n'));
        setHasGeneratedWords(true);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `주제: "${topic}". 이 주제와 관련된 한국어 낱말 또는 짧은 문장 20개를 생성해줘. 각 항목은 줄바꿈으로 구분해줘. 다른 설명 없이 낱말들만 나열해줘.`,
      });
      
      const text = response.text?.trim() || '';
      if (!text) throw new Error('Empty AI response');
      setWordsInput(normalizeGeneratedWords(text, topic).join('\n'));
      setHasGeneratedWords(true);
    } catch (err) {
      console.error("AI Generation Error:", err);
      setWordsInput(getFallbackWords(topic).join('\n'));
      setHasGeneratedWords(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const words = wordsInput.split('\n').map(w => w.trim()).filter(w => w.length > 0);
    if (words.length === 0) return;
    onCreate(words, duration);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-2xl mx-auto py-4"
    >
      <Card className="p-10">
        <h2 className="text-3xl font-black mb-8 flex items-center gap-4 text-zinc-800">
          <motion.div 
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-12 h-12 bg-pastel-purple text-white rounded-2xl flex items-center justify-center shadow-xl shadow-pastel-purple/20"
          >
            <Plus size={32} />
          </motion.div>
          대회 설정하기 📝
        </h2>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-100 space-y-4">
            <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest">AI로 낱말 자동 생성 🤖</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  setHasGeneratedWords(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!isGenerating && theme.trim()) {
                      generateWords();
                    }
                  }
                }}
                placeholder="주제를 입력해 주세요"
                className="flex-1 px-5 py-3 rounded-2xl border border-zinc-200 bg-white focus:outline-none focus:border-pastel-purple transition-all font-bold text-zinc-800"
              />
              <Button 
                onClick={generateWords} 
                disabled={isGenerating || !theme.trim()}
                className={cn(
                  "px-6 py-3 h-auto text-sm text-white rounded-2xl shadow-none transition-colors",
                  isGenerating
                    ? "bg-pastel-blue"
                    : hasGeneratedWords
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : "bg-zinc-800 hover:bg-zinc-700"
                )}
              >
                {isGenerating ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Sparkles size={18} /> 생성하기</>
                )}
              </Button>
            </div>
            <p className="text-xs text-zinc-400 font-bold">이 주제들로 입력해 주세요: 동물, 과일, 채소, 학교, 우주, 속담</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest">낱말 또는 문장 입력 ✍️</label>
            <textarea
              value={wordsInput}
              onChange={(e) => setWordsInput(e.target.value)}
              placeholder="예:&#10;사과&#10;바나나&#10;동해물과 백두산이 마르고 닳도록"
              className="w-full h-48 px-6 py-4 rounded-[32px] border border-zinc-100 bg-zinc-50 focus:outline-none focus:border-pastel-purple focus:bg-white transition-all resize-none font-bold text-zinc-800 text-lg"
              required
            />
            <p className="mt-2 text-xs text-zinc-400 font-bold">한 줄에 하나씩 입력해 주세요!</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest">제한 시간: <span className="text-pastel-purple text-2xl">{duration}초</span> ⏱️</label>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full h-3 bg-zinc-100 rounded-full appearance-none cursor-pointer accent-pastel-purple"
            />
            <div className="flex justify-between text-xs text-zinc-400 font-bold mt-2 uppercase tracking-tighter">
              <span>5초 (매우 빠름)</span>
              <span>30초 (보통)</span>
              <span>60초 (여유로움)</span>
            </div>
          </div>
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold flex items-center gap-2 border-2 border-rose-100">
              <AlertCircle size={20} /> {error}
            </div>
          )}
          <div className="flex gap-4 pt-4">
            <Button variant="outline" onClick={onBack} className="flex-1 h-14 rounded-2xl font-black border-none bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-lg">뒤로가기</Button>
            <Button type="submit" className="flex-[2] h-14 rounded-2xl font-black bg-pastel-purple hover:brightness-95 text-white border-none shadow-lg shadow-pastel-purple/20 text-xl">방 만들기! 🎈</Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}

function StudentJoin({ onJoin, onBack, error, initialCode = '' }: { onJoin: (code: string, name: string) => void, onBack: () => void, error: string | null, initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay to ensure focus after animation
    const timer = setTimeout(() => {
      if (codeInputRef.current) {
        codeInputRef.current.focus();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code && name) onJoin(code, name);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-lg mx-auto py-4"
    >
      <Card className="p-10">
        <h2 className="text-3xl font-bold mb-8 flex items-center gap-4 text-zinc-800">
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-12 h-12 bg-pastel-coral text-white rounded-2xl flex items-center justify-center shadow-xl shadow-pastel-coral/20"
          >
            <Gamepad2 size={32} />
          </motion.div>
          대회 참여하기 🎮
        </h2>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest">방 번호 입력 🔑</label>
            <div className="relative">
              <input
                ref={codeInputRef}
                type="text"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                  setCode(val);
                }}
                placeholder="6자리 숫자 코드"
                className="w-full h-16 px-6 py-4 text-2xl font-bold text-center rounded-[24px] border border-zinc-100 bg-zinc-50 focus:outline-none focus:border-pastel-coral focus:bg-white transition-all text-zinc-800"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-400 mb-4 uppercase tracking-widest">내 이름 🐥</label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="이름을 입력하세요" 
              className="h-16 text-2xl font-bold text-center rounded-[24px] border border-zinc-100 bg-zinc-50 focus:border-pastel-coral focus:bg-white transition-all"
            />
          </div>
          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold flex items-center gap-2 border-2 border-rose-100">
              <AlertCircle size={20} /> {error}
            </div>
          )}
          <div className="flex gap-4 pt-4">
            <Button variant="outline" onClick={onBack} className="flex-1 h-14 rounded-2xl font-black border-none bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-lg">뒤로가기</Button>
            <Button type="submit" className="flex-[2] h-14 rounded-2xl font-black bg-pastel-coral hover:brightness-95 text-white border-none shadow-lg shadow-pastel-coral/20 text-xl">입장하기! 🚀</Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
}

function RoomView({ 
  room, 
  participants, 
  isTeacher, 
  playerName,
  timeLeft,
  currentInput,
  setCurrentInput,
  onStart,
  onSubmit,
  myParticipant,
  onCopyLink,
  copySuccess,
  onLeave
}: { 
  room: Room, 
  participants: Participant[], 
  isTeacher: boolean,
  playerName: string,
  timeLeft: number,
  currentInput: string,
  setCurrentInput: (val: string) => void,
  onStart: () => void,
  onSubmit: () => Promise<string | null>,
  myParticipant: Participant | null,
  onCopyLink: () => void,
  copySuccess: boolean,
  onLeave: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<null | 'correct' | 'wrong'>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [floatingWords, setFloatingWords] = useState<{id: number, text: string, x: number, type: 'correct' | 'wrong'}[]>([]);

  const currentWord = room.words[room.currentWordIndex];
  const isCorrect = currentInput.trim() === currentWord.trim();
  const isAlreadyDone = myParticipant?.scores[room.currentWordIndex]?.accuracy === 100;

  useEffect(() => {
    setFeedback(null);
    setFeedbackText('');
    if (room.status === 'playing') {
      // Use a slightly longer delay and requestAnimationFrame for better focus reliability
      const focusTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          if (inputRef.current && !inputRef.current.disabled) {
            inputRef.current.focus();
          }
        });
      }, 200);
      return () => clearTimeout(focusTimer);
    }
  }, [room.status, room.currentWordIndex]);

  // Also focus when feedback is cleared (meaning next word is ready)
  useEffect(() => {
    if (room.status === 'playing' && !feedback && !isAlreadyDone) {
      const focusTimer = setTimeout(() => {
        if (inputRef.current && !inputRef.current.disabled) {
          inputRef.current.focus();
        }
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [feedback, isAlreadyDone, room.status]);

  const handleLocalSubmit = async () => {
    if (feedback === 'correct' || isAlreadyDone) return;
    
    const result = await onSubmit();
    if (result === 'correct') {
      const texts = ['최고예요!', '대단해요!', '천재인가요?', '우와아!', '참 잘했어요!', '멋져요!', '완벽해요!', '짱이에요!', '최고최고!', '대박이에요!'];
      const feedbackMsg = texts[Math.floor(Math.random() * texts.length)];
      setFeedback('correct');
      setFeedbackText(feedbackMsg);
      
      // Add floating word
      const emojis = ['✨', '🌟', '🌈', '🍭', '🎈', '🌸', '🐥', '⭐', '🎊', '🎉', '🍦', '🍩', '🍬', '🧸', '🎀'];
      const newFloatingWord = {
        id: Date.now(),
        text: `${feedbackMsg} ${emojis[Math.floor(Math.random() * emojis.length)]}`,
        x: Math.random() * 100 - 50, // More random horizontal offset
        type: 'correct' as const
      };
      setFloatingWords(prev => [...prev, newFloatingWord]);
      
      // Remove floating word after animation
      setTimeout(() => {
        setFloatingWords(prev => prev.filter(w => w.id !== newFloatingWord.id));
      }, 2000);
    } else if (result === 'wrong') {
      const wrongTexts = ['아쉬워요!', '다시 해봐요!', '틀렸어요!', '조금만 더!', '거의 다 왔어요!', '힘내세요!', '할 수 있어요!'];
      const feedbackMsg = wrongTexts[Math.floor(Math.random() * wrongTexts.length)];
      setFeedback('wrong');
      setFeedbackText(feedbackMsg);

      // Add floating word for wrong answer
      const wrongEmojis = ['❌', '🥺', '💭', '⚠️', '💔', '💧', '😿', '💨'];
      const newFloatingWord = {
        id: Date.now(),
        text: `${feedbackMsg} ${wrongEmojis[Math.floor(Math.random() * wrongEmojis.length)]}`,
        x: Math.random() * 60 - 30,
        type: 'wrong' as const
      };
      setFloatingWords(prev => [...prev, newFloatingWord]);

      setTimeout(() => {
        setFeedback(null);
        setFeedbackText('');
        setFloatingWords(prev => prev.filter(w => w.id !== newFloatingWord.id));
      }, 1000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Room Info Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white px-6 py-4 rounded-3xl border border-zinc-100 shadow-xl shadow-zinc-200/30">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-pastel-yellow-light rounded-xl text-[11px] font-bold text-zinc-700 uppercase tracking-widest border border-pastel-yellow/30">
              방 번호: <span className="text-zinc-900 font-black">{room.id}</span>
            </div>
            <button 
              onClick={onCopyLink}
              className="p-2 text-zinc-400 hover:text-pastel-coral hover:bg-pastel-coral-light rounded-xl transition-all border border-transparent hover:border-pastel-coral/20"
              title="방 링크 복사"
            >
              {copySuccess ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </button>
          </div>
          <div className="h-6 w-[1px] bg-zinc-100 hidden sm:block" />
          <div className="flex items-center gap-2 text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
            <Users size={16} className="text-pastel-blue" />
            <span className="font-bold text-[11px]">{participants.length}명의 친구들</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTeacher && room.status === 'waiting' && (
            <Button onClick={onStart} className="py-2 px-5 text-xs font-bold bg-pastel-coral hover:brightness-95 text-white rounded-xl shadow-lg shadow-pastel-coral/10 border-none">
              <Play size={16} className="mr-2" /> 대회 시작!
            </Button>
          )}
          <div className="px-3 py-1.5 bg-zinc-50 rounded-xl text-[11px] font-bold text-zinc-400 border border-zinc-100">
            {room.status === 'waiting' ? '대기 중...' : room.status === 'playing' ? '진행 중! 🔥' : '종료됨'}
          </div>
          <Button variant="outline" onClick={onLeave} className="py-2 px-4 text-xs font-bold border-none text-rose-400 hover:bg-rose-50 rounded-xl">
            <LogOut size={16} className="mr-2" /> 나가기
          </Button>
        </div>
      </div>
      
      {isTeacher && room.status === 'waiting' && (
        <div className="bg-pastel-blue-light border border-pastel-blue/20 p-8 rounded-3xl flex items-center justify-center gap-6 shadow-xl shadow-pastel-blue/5">
          <div className="flex items-center gap-4 text-pastel-blue-900">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-pastel-blue shadow-md border border-pastel-blue/10">
              <Stars size={32} />
            </div>
            <p className="text-lg font-bold text-zinc-700">친구들에게 링크를 보내거나 방 번호를 알려주세요! 🌈</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Game Area */}
        <div className="lg:col-span-2 space-y-6">
          {room.status === 'waiting' && (
            <Card className="p-10 flex flex-col items-center text-center gap-6 bg-white">
              <div className="w-20 h-20 bg-pastel-pink text-white rounded-3xl flex items-center justify-center animate-bounce shadow-2xl shadow-pastel-pink/20">
                <Heart size={40} />
              </div>
              <div>
                <h2 className="text-3xl font-bold mb-3 text-zinc-900">친구들을 기다려요! 🍭</h2>
                <p className="text-zinc-500 font-bold text-lg">방 번호 <span className="font-black text-pastel-coral px-3 py-1 bg-pastel-coral-light rounded-lg">{room.id}</span>를 친구들에게 알려주세요.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {participants.map(p => (
                  <motion.span 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={p.id} 
                    className="px-6 py-3 bg-white border border-zinc-100 rounded-2xl text-sm font-bold shadow-sm text-zinc-700"
                  >
                    {p.name} 🐥
                  </motion.span>
                ))}
              </div>
            </Card>
          )}

          {room.status === 'playing' && (
            <div className="space-y-6">
              {isTeacher ? (
                <Card className="p-10 flex flex-col items-center text-center gap-8 bg-white border-2 border-pastel-purple/10">
                  <div className="w-24 h-24 bg-pastel-purple text-white rounded-[32px] flex items-center justify-center animate-pulse shadow-2xl shadow-pastel-purple/20">
                    <Stars size={48} />
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-4xl font-black text-zinc-900 tracking-tight">대회가 진행 중입니다! 🔥</h2>
                    <p className="text-zinc-500 font-bold text-xl">학생들이 열심히 문제를 풀고 있어요. 실시간 순위를 확인해 보세요!</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 w-full max-w-2xl mt-4">
                    <div className="p-6 bg-pastel-blue-light rounded-3xl border border-pastel-blue/20 text-center">
                      <p className="text-xs font-black text-pastel-blue-900 uppercase tracking-widest mb-2">현재 문제</p>
                      <p className="text-4xl font-black text-pastel-blue-900">{room.currentWordIndex + 1} / {room.words.length}</p>
                    </div>
                    <div className={cn(
                      "p-6 rounded-3xl border text-center transition-all",
                      timeLeft <= 5 ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-pastel-yellow-light border-pastel-yellow/20 text-zinc-700"
                    )}>
                      <p className="text-xs font-black uppercase tracking-widest mb-2">남은 시간</p>
                      <p className="text-4xl font-black">{timeLeft}초</p>
                    </div>
                  </div>

                  <div className="w-full bg-zinc-50 p-6 rounded-3xl border border-zinc-100">
                    <p className="text-sm font-bold text-zinc-400 mb-4">현재 제시어</p>
                    <p className="text-5xl font-black text-zinc-800 tracking-tight">{currentWord}</p>
                  </div>
                </Card>
              ) : (
                <Card className="p-10 flex flex-col items-center gap-8 relative overflow-hidden">
                  {/* Progress Bar */}
                  <div className="absolute top-0 left-0 w-full h-2 bg-zinc-50">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-pastel-coral to-pastel-pink"
                      initial={{ width: '100%' }}
                      animate={{ width: `${(timeLeft / room.durationPerWord) * 100}%` }}
                      transition={{ duration: 1, ease: 'linear' }}
                    />
                  </div>

                  <div className="flex items-center justify-between w-full">
                    <span className="px-5 py-2 bg-zinc-50 rounded-xl text-xs font-bold text-zinc-400 uppercase tracking-widest border border-zinc-100">
                      문제 {room.currentWordIndex + 1} / {room.words.length} 📝
                    </span>
                    <div className={cn(
                      "flex items-center gap-2 px-6 py-3 rounded-2xl font-mono font-bold text-2xl transition-all border shadow-lg",
                      timeLeft <= 5 ? "bg-rose-50 text-rose-600 animate-bounce border-rose-100 shadow-rose-200/20" : "bg-pastel-yellow-light text-zinc-700 border-pastel-yellow/30 shadow-pastel-yellow/10"
                    )}>
                      <Timer size={24} /> {timeLeft}초
                    </div>
                  </div>

                  <div className="text-center space-y-4 relative py-8">
                    {/* Floating Words Animation */}
                    <AnimatePresence>
                      {floatingWords.map(word => (
                        <motion.div
                          key={word.id}
                          initial={{ opacity: 0, y: 0, x: word.x, scale: 0.5 }}
                          animate={{ opacity: 1, y: -200, x: word.x * 1.5, scale: 1.2, rotate: word.x / 2 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none z-50"
                        >
                          <div className={cn(
                            "px-4 py-2 bg-white rounded-full border-2 shadow-lg font-black text-lg whitespace-nowrap",
                            word.type === 'correct' ? "border-pastel-green text-pastel-green-900" : "border-rose-300 text-rose-600"
                          )}>
                            {word.text}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <h3 className="text-5xl md:text-7xl font-black text-zinc-900 select-none tracking-tight">
                      {currentWord}
                    </h3>
                    <div className="flex items-center justify-center gap-2 text-zinc-400 font-bold text-sm">
                      <MousePointer2 size={18} />
                      <span>똑같이 입력해봐요!</span>
                    </div>
                  </div>

                  <div className="w-full max-w-lg space-y-6">
                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        disabled={feedback === 'correct' || isAlreadyDone}
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            if (e.key === ' ') e.preventDefault();
                            handleLocalSubmit();
                          }
                        }}
                        placeholder={isAlreadyDone ? "참 잘했어요! 👍" : "여기에 입력하세요..."}
                        className={cn(
                          "w-full px-8 py-6 text-3xl text-center rounded-[32px] border-4 transition-all focus:outline-none shadow-inner font-black",
                          feedback === 'correct' || isAlreadyDone
                            ? "border-pastel-green bg-emerald-50 text-pastel-green-900 shadow-pastel-green/10" 
                            : feedback === 'wrong'
                              ? "border-rose-300 bg-rose-50 text-rose-700"
                              : "border-zinc-100 bg-zinc-50 focus:border-pastel-coral focus:bg-white focus:shadow-2xl focus:shadow-pastel-coral/10"
                        )}
                      />
                      
                      {(feedback === 'correct' || isAlreadyDone) && (
                        <motion.div 
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          className="absolute -right-6 -top-6 w-14 h-14 bg-pastel-green text-white rounded-full flex items-center justify-center shadow-lg border-4 border-white"
                        >
                          <CheckCircle2 size={32} />
                        </motion.div>
                      )}
                    </div>
                    <Button 
                      onClick={handleLocalSubmit} 
                      disabled={feedback === 'correct' || isAlreadyDone}
                      className={cn(
                        "w-full py-6 text-2xl font-black rounded-2xl shadow-xl transition-all border-none h-20",
                        (feedback === 'correct' || isAlreadyDone) 
                          ? "bg-pastel-green text-white" 
                          : "bg-pastel-coral hover:brightness-95 text-white shadow-pastel-coral/20"
                      )}
                    >
                      {(feedback === 'correct' || isAlreadyDone) ? (
                        <><Sparkles size={28} className="mr-3" /> 성공! 🌈</>
                      ) : (
                        <><Rocket size={28} className="mr-3" /> 제출하기! 🚀</>
                      )}
                    </Button>
                  </div>
                </Card>
              )}

              {/* My Stats */}
              {!isTeacher && (
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4 flex items-center gap-3 bg-white border-2 border-white rounded-2xl shadow-lg shadow-zinc-200/50">
                    <div className="w-10 h-10 bg-pastel-yellow text-zinc-700 rounded-xl flex items-center justify-center shadow-lg shadow-pastel-yellow/20">
                      <Trophy size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">내 점수 🏆</p>
                      <p className="text-lg font-black text-zinc-900">{myParticipant?.totalScore.toLocaleString()}점</p>
                    </div>
                  </Card>
                  <Card className="p-4 flex items-center gap-3 bg-white border-2 border-white rounded-2xl shadow-lg shadow-zinc-200/50">
                    <div className="w-10 h-10 bg-pastel-blue text-white rounded-xl flex items-center justify-center shadow-lg shadow-pastel-blue/20">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">성공한 개수 ✅</p>
                      <p className="text-lg font-black text-zinc-900">{Object.keys(myParticipant?.scores || {}).length}개</p>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {room.status === 'finished' && (
            <div className="relative">
              {/* Confetti Particles */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 100, x: 0 }}
                    animate={{ 
                      opacity: [0, 1, 0], 
                      y: [-100, -400], 
                      x: [(Math.random() - 0.5) * 400, (Math.random() - 0.5) * 600],
                      rotate: [0, Math.random() * 360]
                    }}
                    transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
                    className="absolute top-1/2 left-1/2 text-xl"
                  >
                    {['🎉', '✨', '🎈', '🌈', '⭐', '🍭', '🌸', '🎊'][Math.floor(Math.random() * 8)]}
                  </motion.div>
                ))}
              </div>

              <Card className="p-6 text-center space-y-4 bg-gradient-to-br from-pastel-purple to-pastel-pink text-white rounded-3xl shadow-xl border-2 border-white/30 relative z-0">
                <motion.div 
                  animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-14 h-14 bg-white/30 rounded-2xl flex items-center justify-center mx-auto border border-white/40 shadow-xl"
                >
                  <Trophy size={28} className="text-pastel-yellow" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-black mb-1 tracking-tight">대회 종료! 🎉</h2>
                  <p className="text-white/80 text-base font-bold">모두 모두 정말 잘했어요! 최고예요! 👍</p>
                </div>
                
                <div className="max-w-xs mx-auto bg-white/30 rounded-2xl p-4 border border-white/30 shadow-xl">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/70 mb-2">오늘의 타자왕 👑</p>
                  {participants[0] ? (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl font-black tracking-tight">{participants[0].name}</span>
                      <span className="px-4 py-1 bg-white/40 rounded-xl text-xl font-black">{participants[0].totalScore.toLocaleString()}점</span>
                    </div>
                  ) : (
                    <p className="font-bold">친구들이 없어요 🥺</p>
                  )}
                </div>

                <Button onClick={onLeave} className="h-10 px-6 text-base font-black bg-white text-pastel-purple border-none hover:bg-zinc-50 rounded-lg shadow-xl transition-transform hover:scale-105">
                  메인으로 돌아가기 🏠
                </Button>
              </Card>
            </div>
          )}
        </div>

        {/* Sidebar: Leaderboard */}
        <div className="space-y-8">
          <Card className="flex flex-col h-full">
            <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-pastel-yellow-light gap-4">
              <h3 className="font-bold text-xl flex items-center gap-3 text-zinc-800 shrink-0">
                {room.status === 'waiting' ? (
                  <><Users size={28} className="text-pastel-blue" /> 참여 학생 🐣</>
                ) : (
                  <><Trophy size={28} className="text-pastel-yellow" /> 실시간 순위 🏆</>
                )}
              </h3>
              <div className="flex items-center gap-1 px-4 py-1.5 bg-white rounded-xl text-xs font-bold text-zinc-500 shadow-sm border border-zinc-100 whitespace-nowrap">
                <span>{participants.length}</span>
                <span>명</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[500px]">
              {participants.map((p, index) => (
                <motion.div 
                  layout
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between p-5 rounded-2xl transition-all border",
                    p.id === currentUserId 
                      ? "bg-pastel-purple-light border-pastel-purple/20 shadow-lg shadow-pastel-purple/5" 
                      : "bg-zinc-50 border-zinc-100 hover:bg-white hover:border-zinc-200"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {room.status !== 'waiting' ? (
                      <span className={cn(
                        "w-10 h-10 flex items-center justify-center rounded-xl text-base font-bold shadow-sm border",
                        index === 0 ? "bg-pastel-yellow border-pastel-yellow/50 text-zinc-700" : 
                        index === 1 ? "bg-zinc-100 border-zinc-200 text-zinc-500" :
                        index === 2 ? "bg-pastel-orange border-pastel-orange/50 text-zinc-700" : "bg-white border-zinc-100 text-zinc-300"
                      )}>
                        {index + 1}
                      </span>
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center bg-pastel-blue-light rounded-xl text-pastel-blue border border-pastel-blue/20">
                        <UserIcon size={20} />
                      </div>
                    )}
                    <span className="font-bold text-lg text-zinc-800 truncate max-w-[120px]">{p.name}</span>
                  </div>
                  {room.status !== 'waiting' && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-zinc-900">{p.totalScore.toLocaleString()}</span>
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">점</span>
                    </div>
                  )}
                </motion.div>
              ))}
              {participants.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-zinc-300 py-32">
                  <Users size={64} className="opacity-10 mb-6" />
                  <p className="font-bold text-xl">친구들을 기다려요...</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
