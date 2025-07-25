'use client';

import MCPClient from '@/components/MCPClient';
import { Chat } from '@/components/Chat';

export default function Home() {
  return (
    <main className="container mx-auto p-4 space-y-8">
      <Chat />
      <MCPClient />
    </main>
  );
}
