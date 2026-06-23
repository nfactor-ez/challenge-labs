// ─── API Types ────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  avatar_url?: string;
  created_at: string;
}

export interface Category {
  id: number;
  created_at: string;
  name: string;
  slug: string;
  description: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Task {
  id: number;
  challenge_id: number;
  order: number;
  title: string;
  description: string;
  is_required: boolean;
}

export interface Challenge {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  slug: string;
  description: string;
  difficulty: Difficulty;
  points: number;
  docker_image: string;
  tags: string;
  is_published: boolean;
  category_id: number;
  category?: Category;
  tasks?: Task[];
}

export type SessionStatus = 'booting' | 'active' | 'terminating' | 'expired' | 'error';

export interface Session {
  id: number;
  session_key: string;
  challenge_id?: number;
  status: SessionStatus;
  container_ip: string;
  expires_at: string;
  remaining: number;
  created_at: string;
  running?: boolean;
  challenge?: Challenge;
}

export interface UserProgress {
  id: number;
  created_at: string;
  updated_at: string;
  user_id: number;
  challenge_id: number;
  completed: boolean;
  flag_submitted: boolean;
  points_awarded: number;
  completed_at?: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  avatar_url?: string;
  total_points: number;
  challenges_solved: number;
}

export interface AdminStats {
  active_sessions: number;
  total_users: number;
  total_challenges: number;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
