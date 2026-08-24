import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NoteEditForm } from './NoteEditForm';

describe('NoteEditForm Component Tests (React Testing Library)', () => {
  it('renders title and content inputs seeded with initialData', () => {
    const initialData = { title: 'Initial Title', content: 'Initial Content Body' };
    render(<NoteEditForm initialData={initialData} onSave={vi.fn()} onCancel={vi.fn()} />);

    const titleInput = screen.getByLabelText(/title/i);
    const contentTextarea = screen.getByLabelText(/content/i);

    expect(titleInput.value).toBe('Initial Title');
    expect(contentTextarea.value).toBe('Initial Content Body');
  });

  it('updates input value on typing', () => {
    render(<NoteEditForm initialData={{ title: '', content: '' }} onSave={vi.fn()} onCancel={vi.fn()} />);

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'My new note title' } });

    expect(titleInput.value).toBe('My new note title');
  });

  it('calls onSave callback with valid form data on submit', async () => {
    const handleSave = vi.fn().mockResolvedValue({});
    render(
      <NoteEditForm
        initialData={{ title: 'Existing Note', content: 'Existing Content' }}
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    expect(handleSave).toHaveBeenCalledWith({
      title: 'Updated Title',
      content: 'Existing Content',
    });
  });

  it('displays error message when submitting short title (< 3 chars)', () => {
    const handleSave = vi.fn();
    render(<NoteEditForm initialData={{ title: 'Hi', content: 'Valid Content' }} onSave={handleSave} onCancel={vi.fn()} />);

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    expect(screen.getByText(/title must be at least 3 characters long/i)).toBeInTheDocument();
    expect(handleSave).not.toHaveBeenCalled();
  });
});
