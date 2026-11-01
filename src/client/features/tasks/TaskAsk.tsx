import type { Task } from '@shared/types';
import { ArrowUp, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppData } from '../../app/context';
import { cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAskTask, type ChatTurn } from '../../lib/queries';

// Conversations live on the device for the session, so reopening a task picks up where you left off.
const conversations = new Map<string, ChatTurn[]>();

function starters(task: Task): string[] {
  if (task.kind === 'maintenance') {
    return [
      'How do I do this?',
      'What do I need to buy?',
      'Can I do it myself?',
      'What happens if I wait?',
    ];
  }
  return ['Help me get this done', 'Break it into small steps', 'How long will it take?'];
}

/** Renders a plain-text answer: paragraphs, with "- " lines as a list. */
function Answer({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const list = /^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    const content = list ? line.replace(/^([-•*]|\d+[.)])\s+/, '') : line;
    if (last && last.list === list && (list || last.lines.length > 0)) last.lines.push(content);
    else blocks.push({ list, lines: [content] });
  }
  return (
    <div className="space-y-2">
      {blocks
        .filter((block) => block.lines.length > 0)
        .map((block, i) =>
          block.list ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{block.lines.join(' ')}</p>
          ),
        )}
    </div>
  );
}

/** Conversation state for one task; the server adds all of the task's details to each question. */
export function useTaskAsk(task: Task | null) {
  const id = task?.id ?? '';
  const [state, setState] = useState(() => ({ id, turns: conversations.get(id) ?? [] }));
  const ask = useAskTask();
  // Switching to another task loads that task's conversation.
  if (state.id !== id) setState({ id, turns: conversations.get(id) ?? [] });
  const turns = state.id === id ? state.turns : (conversations.get(id) ?? []);
  // Updates one task's conversation, even if another task is showing by the time an answer lands.
  const update = (taskId: string, change: (prev: ChatTurn[]) => ChatTurn[]) => {
    const next = change(conversations.get(taskId) ?? []);
    conversations.set(taskId, next);
    setState((prev) => (prev.id === taskId ? { id: taskId, turns: next } : prev));
  };

  const send = (question: string) => {
    const text = question.trim();
    if (!task || !text || ask.isPending) return;
    const taskId = task.id;
    const history = turns;
    update(taskId, () => [...history, { role: 'user', content: text }]);
    ask.mutate(
      { id: taskId, question: text, history: history.slice(-20) },
      {
        onSuccess: ({ answer }) =>
          update(taskId, (prev) => [...prev, { role: 'assistant', content: answer }]),
        // Take the question back out; the composer offers it again for a retry.
        onError: () => update(taskId, (prev) => prev.slice(0, -1)),
      },
    );
  };

  return {
    turns,
    send,
    pending: ask.isPending,
    error: ask.isError ? errorMessage(ask.error) : null,
    failedQuestion: ask.isError ? (ask.variables?.question ?? '') : '',
  };
}

export type TaskAskState = ReturnType<typeof useTaskAsk>;

export function TaskAskMessages({ task, chat }: { task: Task; chat: TaskAskState }) {
  const { bootstrap } = useAppData();
  const end = useRef<HTMLDivElement>(null);
  const { turns, pending, error, send } = chat;

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  if (!bootstrap.ai.enabled) {
    return (
      <div className="mt-2 rounded-2xl bg-surface-2 p-4 text-[14px] leading-relaxed text-ink-2">
        The AI expert isn't set up on this server yet. Once a Foundry or Azure OpenAI key is added,
        you can ask anything about this task here.
      </div>
    );
  }

  return (
    <div>
      {turns.length === 0 && (
        <div className="py-2">
          <div className="flex items-start gap-3 rounded-2xl bg-accent-soft/60 p-4">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-accent" />
            <p className="text-[14px] leading-relaxed text-ink">
              Ask anything about <span className="font-semibold">{task.title}</span>. The expert
              sees all its details: due date, steps, notes and history.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {starters(task).map((question) => (
              <button
                key={question}
                onClick={() => send(question)}
                disabled={pending}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13.5px] font-medium text-ink-2 transition hover:border-line-strong active:scale-[0.97]"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3 py-2" aria-live="polite">
        {turns.map((turn, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cx('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cx(
                'max-w-[88%] rounded-3xl px-4 py-2.5 text-[14.5px] leading-relaxed',
                turn.role === 'user'
                  ? 'rounded-br-lg bg-accent text-on-accent'
                  : 'rounded-bl-lg bg-surface-2 text-ink',
              )}
            >
              {turn.role === 'user' ? turn.content : <Answer text={turn.content} />}
            </div>
          </motion.div>
        ))}
        {pending && (
          <div className="flex justify-start" role="status" aria-label="The expert is thinking">
            <div className="flex gap-1 rounded-3xl rounded-bl-lg bg-surface-2 px-4 py-3.5">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="size-2 rounded-full bg-ink-3"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.18 }}
                />
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-[13px] font-medium text-overdue">{error}</p>}
      </div>
      <div ref={end} />
    </div>
  );
}

export function TaskAskComposer({ chat }: { chat: TaskAskState }) {
  // Remounting after each turn clears the box, or refills it with a question that failed.
  return (
    <AskComposer
      key={chat.turns.length}
      disabled={chat.pending}
      onSend={chat.send}
      initial={chat.failedQuestion}
    />
  );
}

function AskComposer({
  onSend,
  disabled,
  initial,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend(text);
  };
  return (
    <form onSubmit={submit}>
      <div className="flex items-end gap-2 rounded-3xl border border-line bg-canvas py-1.5 pr-1.5 pl-4 focus-within:border-accent/60">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) submit(event);
          }}
          rows={1}
          maxLength={1000}
          placeholder="Ask about this task…"
          aria-label="Your question"
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none [field-sizing:content] placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label="Send"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition active:scale-95 disabled:opacity-40"
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </form>
  );
}
