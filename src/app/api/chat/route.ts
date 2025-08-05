import { NextRequest, NextResponse } from 'next/server';
import { ProviderFactory } from '@/services/providerFactory';
import { ChatMessage } from '@/lib/types/chat';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));
    const { messages, provider, model } = body;

    const providerInstance = ProviderFactory.getProvider(provider);
    if (!providerInstance) {
      return NextResponse.json(
        { error: `Provider ${provider} not found` },
        { status: 400 }
      );
    }

    console.log('Messages being sent to provider:', JSON.stringify(messages, null, 2));
    const response = await providerInstance.sendMessage(messages, model);

    return NextResponse.json({ success: true, content: response });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 