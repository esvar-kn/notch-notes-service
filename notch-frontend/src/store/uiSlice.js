import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  filter: 'all', // 'all' | 'starred' | 'archived'
  starredNoteIds: [],
  archivedNoteIds: [],
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setFilter: (state, action) => {
      state.filter = action.payload;
    },
    toggleStarNote: (state, action) => {
      const id = action.payload;
      if (state.starredNoteIds.includes(id)) {
        state.starredNoteIds = state.starredNoteIds.filter((noteId) => noteId !== id);
      } else {
        state.starredNoteIds.push(id);
      }
    },
    toggleArchiveNote: (state, action) => {
      const id = action.payload;
      if (state.archivedNoteIds.includes(id)) {
        state.archivedNoteIds = state.archivedNoteIds.filter((noteId) => noteId !== id);
      } else {
        state.archivedNoteIds.push(id);
      }
    },
  },
});

export const { setFilter, toggleStarNote, toggleArchiveNote } = uiSlice.actions;
export default uiSlice.reducer;
