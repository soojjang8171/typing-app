export interface Room {
  id: string;
  teacherId: string;
  status: 'waiting' | 'playing' | 'finished';
  words: string[];
  currentWordIndex: number;
  wordStartTime: number | null;
  durationPerWord: number; // in seconds
  createdAt: number;
}

export interface Participant {
  id: string;
  name: string;
  roomId: string;
  scores: {
    [wordIndex: number]: {
      time: number; // time taken in ms
      accuracy: number; // 0 to 100
      completed: boolean;
    }
  };
  totalScore: number;
  lastUpdated: number;
  lastCorrectAt?: number;
}

export interface GameState {
  room: Room | null;
  participants: Participant[];
  isTeacher: boolean;
  playerName: string;
}
