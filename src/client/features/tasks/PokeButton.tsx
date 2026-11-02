import { canView } from '@shared/status';
import type { Member, Task } from '@shared/types';
import { Hand } from 'lucide-react';
import { useAppData } from '../../app/context';
import { Menu } from '../../components/Menu';
import { useToast } from '../../components/Toast';
import { Avatar, Button } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { usePoke } from '../../lib/queries';

/** Sends another household member a push asking them to have a look at the task. */
export function PokeButton({ task }: { task: Task }) {
  const { me, members, memberById } = useAppData();
  const poke = usePoke();
  const toast = useToast();
  const assignee = memberById(task.assigneeId);
  // Whoever the task is assigned to comes first; nobody can be poked about a task they can't see.
  const targets = members
    .filter((member) => member.id !== me.id && canView(task, member.id))
    .sort((a, b) => Number(b.id === assignee?.id) - Number(a.id === assignee?.id));
  if (targets.length === 0 || task.completedAt) return null;

  const send = (target: Member) =>
    poke.mutate(
      { id: task.id, userId: target.id },
      {
        onSuccess: ({ notificationsOn }) => {
          if (!notificationsOn) {
            toast(`Poked ${target.name}, but they haven't turned on notifications yet`);
          } else {
            toast(`Poked ${target.name} 👉`, { tone: 'success' });
          }
        },
        onError: (error) => toast(errorMessage(error), { tone: 'error' }),
      },
    );

  const label = targets.length === 1 ? `Poke ${targets[0].name}` : 'Poke';
  if (targets.length === 1) {
    return (
      <Button
        variant="secondary"
        size="sm"
        icon={<Hand className="size-4" />}
        loading={poke.isPending}
        onClick={() => send(targets[0])}
      >
        {label}
      </Button>
    );
  }
  return (
    <Menu
      trigger={(props) => (
        <Button
          variant="secondary"
          size="sm"
          icon={<Hand className="size-4" />}
          loading={poke.isPending}
          {...props}
        >
          {label}
        </Button>
      )}
      items={targets.map((target) => ({
        label: target.name,
        icon: <Avatar member={target} size={20} decorative />,
        hint: target.id === assignee?.id ? 'Assigned' : undefined,
        onSelect: () => send(target),
      }))}
    />
  );
}
