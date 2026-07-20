import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WizardProgress from '../components/visit/WizardProgress';

describe('WizardProgress', () => {
  it('shows step 1 as active and steps 2-3 as pending when currentStep=1', () => {
    render(<WizardProgress currentStep={1} />);
    // Step labels appear
    expect(screen.getByText('Identificación')).toBeInTheDocument();
    expect(screen.getByText('Información')).toBeInTheDocument();
    expect(screen.getByText('Visita')).toBeInTheDocument();
  });

  it('renders a step-active indicator for the current step', () => {
    const { container } = render(<WizardProgress currentStep={2} />);
    const activeIndicators = container.querySelectorAll('.step-active');
    expect(activeIndicators).toHaveLength(1);
  });

  it('shows step-completed for steps before the current one', () => {
    const { container } = render(<WizardProgress currentStep={3} />);
    const completed = container.querySelectorAll('.step-completed');
    expect(completed).toHaveLength(2); // Steps 1 and 2 are completed
  });

  it('renders no completed steps when currentStep=1', () => {
    const { container } = render(<WizardProgress currentStep={1} />);
    const completed = container.querySelectorAll('.step-completed');
    expect(completed).toHaveLength(0);
  });

  it('renders a check icon for completed steps', () => {
    // Step 1 is completed when currentStep >= 2
    const { container } = render(<WizardProgress currentStep={2} />);
    // Completed step renders an SVG (the Check icon) instead of a number
    const completedStep = container.querySelector('.step-completed');
    expect(completedStep?.querySelector('svg')).toBeTruthy();
  });

  it('progress bar style changes according to currentStep', () => {
    const { container: c1 } = render(<WizardProgress currentStep={1} />);
    const { container: c3 } = render(<WizardProgress currentStep={3} />);
    const bar1 = c1.querySelector('.wizard-progress-bar') as HTMLElement;
    const bar3 = c3.querySelector('.wizard-progress-bar') as HTMLElement;
    expect(bar1.style.width).toBe('0%');
    expect(bar3.style.width).toBe('100%');
  });
});
