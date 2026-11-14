'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHATBOT_QUESTION_MAX,
  chatbotAskSchema,
  type ChatbotAskInput,
  type ChatSource,
  type UserProfile,
} from '@uniconnect/shared';
import { ArrowUpIcon, RotateCcwIcon } from 'lucide-react';
import { m, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { controlProps, errorId } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Textarea } from '@/components/ui/textarea';
import { useAskChatbot } from '@/hooks/use-chatbot';
import { usePersonalDashboard } from '@/hooks/use-dashboard';
import {
  aiErrorMessage,
  sourceHref,
  sourceLabel,
  STARTER_PROMPTS,
  THREAD_LIMIT,
  type AiError,
} from '@/lib/chatbot';
import { dashboardSections } from '@/lib/dashboard';
import { cn } from '@/lib/utils';
import { SectionHeading } from './section-state';

// FR-AI-001 on the overview (DECISIONS D44, D45). Below the role and personal views, so the
// figures stay first. The thread lives in component state only: nothing about a question
// outlives the page, which matters on a shared lab computer.

const COUNTER_WARN = 450;

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  /** A question whose request failed; it can be sent again. */
  failed?: boolean;
}

export function AssistantSection({ profile }: { profile: UserProfile }) {
  // Accounts with a personal view learn from it whether the server has Gemini; the query is
  // the overview's own, so this costs no request. A super admin has no such view and finds out
  // from the first answer instead.
  const hasPersonal = dashboardSections(profile.role, profile.user_type).includes('personal');
  const personal = usePersonalDashboard({ enabled: hasPersonal });
  const [unconfigured, setUnconfigured] = useState(false);
  const off = unconfigured || personal.data?.chatbot.enabled === false;

  return (
    <section aria-labelledby="dash-assistant" className="flex max-w-3xl flex-col gap-4">
      <SectionHeading
        id="dash-assistant"
        title="Ask UniConnect"
        tag="SYS.AI.CHAT"
        description="Answers come only from events, announcements and clubs you can see. Don't type personal details."
      />
      {off ? (
        <FormAlert tone="info" title="The assistant isn't set up on this server." />
      ) : (
        <AssistantPanel onUnconfigured={() => setUnconfigured(true)} />
      )}
    </section>
  );
}

function AssistantPanel({ onUnconfigured }: { onUnconfigured: () => void }) {
  const ask = useAskChatbot();
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<AiError | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  /** When a 429's Retry-After runs out (epoch ms), or null when not rate limited. */
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const nextId = useRef(1);
  const threadRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setFocus,
    formState: { errors },
  } = useForm<ChatbotAskInput>({
    resolver: zodResolver(chatbotAskSchema),
    defaultValues: { question: '' },
  });
  const length = (useWatch({ control, name: 'question' }) ?? '').length;

  // Keep the newest message in view.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages.length, ask.isPending]);

  // A 429 locks the composer until the server's Retry-After has passed.
  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = setInterval(() => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left > 0) {
        setSecondsLeft(left);
        return;
      }
      clearInterval(timer);
      setSecondsLeft(0);
      setCooldownUntil(null);
      setError(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const coolingDown = secondsLeft > 0;
  const busy = ask.isPending || coolingDown;

  function append(message: Omit<Message, 'id'>) {
    const id = nextId.current++;
    setMessages((list) => [...list, { ...message, id }].slice(-THREAD_LIMIT));
    return id;
  }

  function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    const questionId = append({ role: 'user', text });
    ask.mutate(text, {
      onSuccess: (reply) => {
        append({ role: 'assistant', text: reply.answer, sources: reply.sources });
      },
      onError: (thrown) => {
        const err = thrown as AiError;
        setMessages((list) => list.map((m) => (m.id === questionId ? { ...m, failed: true } : m)));
        if (err.code === 'AI_NOT_CONFIGURED') {
          onUnconfigured();
          return;
        }
        setError(err);
        if (err.status === 429 && err.retryAfter) {
          setSecondsLeft(err.retryAfter);
          setCooldownUntil(Date.now() + err.retryAfter * 1000);
        }
      },
    });
  }

  function retry(message: Message) {
    setMessages((list) => list.filter((m) => m.id !== message.id));
    send(message.text);
  }

  function onSubmit(e?: FormEvent) {
    void handleSubmit(({ question }) => {
      if (busy) return;
      send(question);
      reset({ question: '' });
      setFocus('question');
    })(e);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  }

  const fieldError = errors.question?.message;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
      <div
        ref={threadRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the assistant"
        className="flex max-h-96 min-h-40 flex-col gap-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && !ask.isPending ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-tertiary">
              Ask about events, club fees or announcements. Try one of these:
            </p>
            <ul className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <li key={prompt}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => send(prompt)}
                  >
                    {prompt}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <UserBubble
              key={message.id}
              message={message}
              onRetry={() => retry(message)}
              busy={busy}
            />
          ) : (
            <AssistantReply key={message.id} message={message} />
          ),
        )}

        {ask.isPending ? <TypingIndicator /> : null}
      </div>

      <form
        noValidate
        onSubmit={onSubmit}
        aria-label="Ask the assistant"
        className="flex flex-col gap-2 border-t border-border bg-background/40 p-3"
      >
        {error ? (
          <FormAlert tone="error" title={aiErrorMessage(error, secondsLeft || undefined)} />
        ) : null}
        <label htmlFor="assistant-question" className="sr-only">
          Your question
        </label>
        <Textarea
          {...controlProps('assistant-question', { error: fieldError })}
          {...register('question')}
          rows={2}
          maxLength={CHATBOT_QUESTION_MAX}
          placeholder="Ask a question about your campus"
          disabled={coolingDown}
          onKeyDown={onKeyDown}
          className="min-h-16 resize-none"
        />
        {fieldError ? (
          <p id={errorId('assistant-question')} className="text-sm text-destructive">
            {fieldError}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p
            aria-live="polite"
            className={cn(
              'font-mono text-xs tabular-nums',
              length >= COUNTER_WARN ? 'text-warning' : 'text-fg-tertiary',
            )}
          >
            {length} / {CHATBOT_QUESTION_MAX}
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-fg-tertiary [@media(pointer:fine)]:inline">
              Enter to send, Shift+Enter for a new line
            </span>
            <Button type="submit" size="sm" disabled={busy}>
              <ArrowUpIcon aria-hidden="true" />
              Ask
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function UserBubble({
  message,
  onRetry,
  busy,
}: {
  message: Message;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="micro-label">YOU</span>
      <p className="max-w-[85%] rounded-lg rounded-tr-sm bg-surface-2 px-3 py-2 text-sm whitespace-pre-line text-foreground">
        {message.text}
      </p>
      {message.failed ? (
        <span className="flex items-center gap-2 text-xs text-destructive">
          Not sent
          <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onRetry}>
            <RotateCcwIcon aria-hidden="true" />
            Retry
            <span className="sr-only"> this question</span>
          </Button>
        </span>
      ) : null}
    </div>
  );
}

function AssistantReply({ message }: { message: Message }) {
  const sources = message.sources ?? [];
  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="micro-label">SYS.AI</span>
      <p className="max-w-[85%] text-sm whitespace-pre-line text-foreground">{message.text}</p>
      {sources.length ? (
        <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
          {sources.map((source) => (
            <li key={`${source.type}-${source.id}`}>
              <Badge
                variant="outline"
                className="font-mono"
                render={<Link href={sourceHref(source)} />}
              >
                {sourceLabel(source)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-start gap-1.5" role="status">
      <span className="micro-label">SYS.AI</span>
      <span className="flex h-5 items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <m.span
            key={i}
            className="size-1.5 rounded-full bg-fg-tertiary"
            animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      <span className="sr-only">Assistant is typing…</span>
    </div>
  );
}
