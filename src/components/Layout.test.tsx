import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from './Layout';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  LayoutDashboard: () => <div data-testid="icon-dashboard" />,
  BarChart2: () => <div data-testid="icon-barchart" />,
  Upload: () => <div data-testid="icon-upload" />,
  Settings: () => <div data-testid="icon-settings" />,
  LogOut: () => <div data-testid="icon-logout" />,
  Search: () => <div data-testid="icon-search" />,
  Bell: () => <div data-testid="icon-bell" />,
}));

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  auth: {
    currentUser: {
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: 'https://example.com/photo.jpg',
    },
  },
}));

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
  getAuth: vi.fn(),
}));

describe('Sidebar', () => {
  it('renders all menu items', () => {
    const setActiveTab = vi.fn();
    render(<Sidebar activeTab="dashboard" setActiveTab={setActiveTab} />);

    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
    expect(screen.getByText('COMPARISON')).toBeInTheDocument();
    expect(screen.getByText('ANALYZE')).toBeInTheDocument();
    expect(screen.getByText('ALERTS')).toBeInTheDocument();
    expect(screen.getByText('SETTINGS')).toBeInTheDocument();
  });

  it('calls setActiveTab when a menu item is clicked', () => {
    const setActiveTab = vi.fn();
    render(<Sidebar activeTab="dashboard" setActiveTab={setActiveTab} />);

    fireEvent.click(screen.getByText('COMPARISON'));
    expect(setActiveTab).toHaveBeenCalledWith('compare');
  });

  it('highlights the active tab', () => {
    const setActiveTab = vi.fn();
    render(<Sidebar activeTab="compare" setActiveTab={setActiveTab} />);

    const compareButton = screen.getByText('COMPARISON').closest('button');
    expect(compareButton).toHaveClass('bg-brand');
  });
});
