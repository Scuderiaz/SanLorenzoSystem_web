import React, { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './components/Common/ToastContainer';

const StrictModeToastProbe: React.FC = () => {
  const { showToast } = useToast();

  useEffect(() => {
    showToast('Loaded using fallback data.', 'warning');
  }, [showToast]);

  return null;
};

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('deduplicates the same toast triggered by repeated effects', () => {
    render(
      <React.StrictMode>
        <ToastProvider>
          <StrictModeToastProbe />
        </ToastProvider>
      </React.StrictMode>
    );

    expect(screen.getAllByText('Loaded using fallback data.')).toHaveLength(1);
  });

  test('removes the toast after the default timeout', () => {
    render(
      <ToastProvider>
        <StrictModeToastProbe />
      </ToastProvider>
    );

    expect(screen.getByText('Loaded using fallback data.')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByText('Loaded using fallback data.')).not.toBeInTheDocument();
  });
});
