import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RoastView, type RoastViewProps } from '../../components/roast/RoastView';
import { renderWithProviders } from '../test-utils';

const roast: RoastViewProps['roast'] = {
  score: 72,
  headline: 'Your loops have loops',
  summary: 'Solid effort, questionable naming.',
  intensity: 'savage',
  strengths: ['Clear function boundaries', 'Good test coverage'],
  issues: [
    {
      file: 'main.py',
      line: 3,
      severity: 'low',
      category: 'style',
      message: 'Variable x is meaningless',
      suggested_fix: 'Rename x to total',
    },
    {
      file: 'main.py',
      line: 10,
      severity: 'high',
      category: 'bug',
      message: 'Off-by-one in range',
      suggested_fix: 'Use range(len(items))',
    },
    {
      file: null,
      line: null,
      severity: 'medium',
      category: 'performance',
      message: 'Quadratic lookup',
      suggested_fix: 'Use a set',
    },
    {
      file: 'util.py',
      line: null,
      severity: 'high',
      category: 'security',
      message: 'eval on user input',
      suggested_fix: 'Use ast.literal_eval',
    },
  ],
};

describe('RoastView', () => {
  it('renders score, headline, summary, intensity and strengths', () => {
    renderWithProviders(<RoastView roast={roast} />, { withAuth: false });
    expect(screen.getByLabelText('Score 72 out of 100')).toBeInTheDocument();
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your loops have loops' })).toBeInTheDocument();
    expect(screen.getByText('Solid effort, questionable naming.')).toBeInTheDocument();
    expect(screen.getByLabelText('Intensity: Savage')).toBeInTheDocument();
    expect(screen.getByText('Clear function boundaries')).toBeInTheDocument();
    expect(screen.getByText('Good test coverage')).toBeInTheDocument();
  });

  it('groups issues by severity from high to low', () => {
    renderWithProviders(<RoastView roast={roast} />, { withAuth: false });
    const groups = screen.getAllByTestId(/^issue-group-/);
    expect(groups.map((g) => g.getAttribute('data-testid'))).toEqual([
      'issue-group-high',
      'issue-group-medium',
      'issue-group-low',
    ]);

    const high = within(groups[0]);
    expect(high.getByText('Off-by-one in range')).toBeInTheDocument();
    expect(high.getByText('eval on user input')).toBeInTheDocument();
    expect(high.getByText('main.py:10')).toBeInTheDocument();
    expect(high.getByText('util.py')).toBeInTheDocument();
    expect(within(groups[1]).getByText('Quadratic lookup')).toBeInTheDocument();
    expect(within(groups[2]).getByText('Variable x is meaningless')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Issues (4)' })).toBeInTheDocument();
  });

  it('reveals the suggested fix when an issue is expanded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoastView roast={roast} />, { withAuth: false });
    const button = screen.getByRole('button', { name: /Off-by-one in range/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Use range(len(items))')).toBeInTheDocument();
  });

  it('handles null headline, summary and score', () => {
    renderWithProviders(
      <RoastView
        roast={{ ...roast, headline: null, summary: null, score: null, issues: [], strengths: [] }}
      />,
      { withAuth: false },
    );
    expect(screen.getByLabelText('No score')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText(/No issues found/)).toBeInTheDocument();
    expect(screen.queryByText('Strengths')).not.toBeInTheDocument();
  });
});
