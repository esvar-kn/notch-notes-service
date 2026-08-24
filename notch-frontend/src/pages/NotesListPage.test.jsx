import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import uiReducer from '../store/uiSlice';
import { NotesListPage } from './NotesListPage';
import * as reactQuery from '@tanstack/react-query';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  };
});

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store = configureStore({
    reducer: { ui: uiReducer },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <MemoryRouter>{ui}</MemoryRouter>
      </Provider>
    </QueryClientProvider>
  );
}

describe('NotesListPage Component Tests (React Testing Library)', () => {
  it('renders loading skeletons while fetching notes', () => {
    vi.mocked(reactQuery.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { container } = renderWithProviders(<NotesListPage />);
    expect(container.querySelector('.skeleton-card')).toBeInTheDocument();
  });

  it('renders list of notes when data is loaded', () => {
    const mockNotes = [
      { id: 1, title: 'First React Query Note', content: 'Testing RTL rendering', createdAt: new Date().toISOString() },
      { id: 2, title: 'Second Microservices Note', content: 'Testing multiple notes', createdAt: new Date().toISOString() },
    ];

    vi.mocked(reactQuery.useQuery).mockReturnValue({
      data: {
        success: true,
        notes: mockNotes,
        totalPages: 1,
        page: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
    });

    renderWithProviders(<NotesListPage />);

    expect(screen.getByText('First React Query Note')).toBeInTheDocument();
    expect(screen.getByText('Second Microservices Note')).toBeInTheDocument();
  });
});
