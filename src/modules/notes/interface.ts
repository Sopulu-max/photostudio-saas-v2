/**
 * Notes — public interface. The only door in.
 *
 * The studio's own working memory. A note may be about a booking or a client,
 * or about nothing in particular — which is most of them, and is why the
 * attachment is optional rather than the point.
 */
import {
  listNotes, getNote, createNote, updateNote, setNotePinned, setNoteColour,
  setNoteReminder, listNoteRemindersInRange, deleteNote, listNotesAbout, setNoteAbout,
} from './domain';
export type { Note, NoteAbout } from './domain';
export type { NoteColour } from './colours';
export { NOTE_COLOURS, NOTE_COLOUR_NAMES } from './colours';
export {
  listNotes, getNote, createNote, updateNote, setNotePinned, setNoteColour,
  setNoteReminder, listNoteRemindersInRange, deleteNote, listNotesAbout, setNoteAbout,
};
