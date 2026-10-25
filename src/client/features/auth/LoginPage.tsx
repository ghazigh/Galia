import type { Bootstrap } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Field, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { setBootstrap } from '../../lib/queries';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthLayout>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            setBootstrap(qc, await api<Bootstrap>('/auth/login', { body: { email, password } }));
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">Welcome home</h1>
        <p className="mt-1 text-[15px] text-ink-2">Sign in to see what the house needs.</p>
        <div className="mt-6 space-y-4">
          <Field label="Email">
            <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </div>
        {error && <p className="mt-4 text-[14px] font-medium text-overdue">{error}</p>}
        <Button type="submit" size="lg" block loading={busy} className="mt-6">
          Sign in
        </Button>
        <p className="mt-6 text-center text-[13px] text-ink-3">
          Joining your partner? Open the invite link they sent you.
        </p>
      </form>
    </AuthLayout>
  );
}
