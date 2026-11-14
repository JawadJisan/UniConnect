import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChatLogsView } from './_components/chat-logs-view';

export const metadata: Metadata = { title: 'Chatbot logs' };

// Rendered only behind the client guard (D25), like the other workspace pages.
export const instant = false;

export default function ChatbotLogsPage() {
  // The view reads filters from useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense>
      <ChatLogsView />
    </Suspense>
  );
}
