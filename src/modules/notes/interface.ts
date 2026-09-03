/**
 * Notes — public interface. The only door in.
 *
 * The studio's own working memory: what is not about any one booking, client or
 * invoice. Those each keep their own text where they need it; this keeps
 * everything else.
 */
import {
  listNotes, getNote, createNote, updateNote, setNotePinned, deleteNote,
} from './domain';
export type { Note } from './domain';
export { listNotes, getNote, createNote, updateNote, setNotePinned, deleteNote };
