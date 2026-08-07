import dotenv from 'dotenv';
import path from 'path';
import WebSocket from 'ws';
import { vi } from 'vitest';

// Polyfill WebSocket for Supabase JS in Node < 22
(global as any).WebSocket = WebSocket;

// Load .env.local variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Mock next/cache so revalidatePath doesn't crash outside of Next.js
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
