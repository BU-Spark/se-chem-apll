import { render, screen } from '@testing-library/react';
import AuthScreen from '../AuthScreen';

describe('AuthScreen', () => {
  it('shows the APLL title above its content', () => {
    render(
      <AuthScreen>
        <form aria-label="Sign in form" />
      </AuthScreen>
    );

    expect(screen.getByRole('heading', { name: 'APLL' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Sign in form' })).toBeInTheDocument();
  });
});
