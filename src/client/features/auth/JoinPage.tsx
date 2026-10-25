import type { Bootstrap } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, EmptyState, Field, Spinner, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { setBootstrap, useSession } from '../../lib/queries';
import { AuthLayout } from './AuthLayout';

export function JoinPage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useSession();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ householdName: string; invitedBy: string }>(`/invites/${token}`),
    retry: false,
  });
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.data?.bootstrap) {
    return (
      <AuthLayout>
        <EmptyState
          title="You're already signed in"
          body="Sign out first if you want to join with another account."
          action={<Button onClick={() => navigate('/')}>Go home</Button>}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {invite.isLoading && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}
      {invite.isError && (
        <EmptyState
          title="This invite can't be used"
          body={errorMessage(invite.error)}
          action={
            <Link to="/" className="text-[14px] font-semibold text-accent">
              Go to sign in
            </Link>
          }
        />
      )}
      {invite.data && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              setBootstrap(qc, await api<Bootstrap>(`/invites/${token}/accept`, { body: form }));
              navigate('/', { replace: true });
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink">
            Join {invite.data.householdName}
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {invite.data.invitedBy} invited you to share the house plan and to-dos.
          </p>
          <div className="mt-6 space-y-4">
            <Field label="Your name">
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="given-name" required autoFocus />
            </Field>
            <Field label="Email">
              <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <TextInput
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </div>
          {error && <p className="mt-4 text-[14px] font-medium text-overdue">{error}</p>}
          <Button type="submit" size="lg" block loading={busy} className="mt-6">
            Join the household
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
