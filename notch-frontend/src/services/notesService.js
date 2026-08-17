import api from './api';

export const notesService = {
  /**
   * Fetch all notes for the authenticated user
   * @param {Object} params { page, limit, sort, order }
   */
  async getNotes(params = {}) {
    const response = await api.get('/notes', { params });
    return response.data;
  },

  /**
   * Fetch a single note by ID
   * @param {string|number} id Note ID
   */
  async getNoteById(id) {
    const response = await api.get(`/notes/${id}`);
    return response.data;
  },

  /**
   * Create a new note
   * @param {Object} noteData { title, content }
   */
  async createNote(noteData) {
    const response = await api.post('/notes', noteData);
    return response.data;
  },

  /**
   * Update an existing note by ID
   * @param {string|number} id Note ID
   * @param {Object} noteData { title, content }
   */
  async updateNote(id, noteData) {
    const response = await api.put(`/notes/${id}`, noteData);
    return response.data;
  },

  /**
   * Delete a note by ID
   * @param {string|number} id Note ID
   */
  async deleteNote(id) {
    const response = await api.delete(`/notes/${id}`);
    return response.data;
  },
};

export default notesService;
