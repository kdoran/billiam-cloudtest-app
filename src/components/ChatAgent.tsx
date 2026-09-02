import { useState } from 'react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
	PromptInput,
	PromptInputBody,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
	type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { applyTask, readAgentEvents } from '@/lib/agentEvents';

interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	text: string;
}

// AI Elements components, but fed from our own hand-rolled SSE stream (see
// agentEvents.ts) rather than the Vercel AI SDK's useChat - that hook
// expects a backend speaking its own message-stream protocol from a direct
// model call, and what's actually streaming here is a multi-step pipeline
// (clone -> Claude Code -> install -> build -> commit -> deploy), not model
// tokens. The components don't care what fed them, so they still fit fine.
export default function ChatAgent() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming' | 'error'>('idle');

	async function handleSubmit(message: PromptInputMessage) {
		const task = message.text.trim();
		if (!task || status === 'submitted' || status === 'streaming') return;

		const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text: task };
		const assistantId = crypto.randomUUID();
		setMessages((prev) => [...prev, userMessage, { id: assistantId, role: 'assistant', text: '' }]);
		setStatus('submitted');

		const appendToAssistant = (chunk: string) =>
			setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m)));

		try {
			const body = await applyTask(task);
			setStatus('streaming');
			let done = false;
			for await (const event of readAgentEvents(body)) {
				if (event.type === 'status') {
					appendToAssistant(`\n[${event.message}]\n`);
				} else if (event.type === 'log') {
					appendToAssistant(event.data);
				} else if (event.type === 'done') {
					done = true;
					appendToAssistant(`\n\nLive at ${event.appUrl} - reloading…`);
				} else if (event.type === 'error') {
					throw new Error(event.message);
				}
			}
			// Already committed to main and deployed live - this *is* that new
			// version, so just reload into it.
			if (done) {
				window.location.reload();
				return;
			}
			setStatus('idle');
		} catch (err) {
			appendToAssistant(`\n\nError: ${err instanceof Error ? err.message : String(err)}`);
			setStatus('error');
		}
	}

	return (
		<div className="mx-auto flex h-dvh max-w-2xl flex-col p-4">
			<Conversation>
				<ConversationContent>
					{messages.map((m) => (
						<Message key={m.id} from={m.role}>
							<MessageContent>
								<div className="whitespace-pre-wrap">{m.text || (m.role === 'assistant' ? '…' : '')}</div>
							</MessageContent>
						</Message>
					))}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<PromptInput onSubmit={handleSubmit} className="mt-4">
				<PromptInputBody>
					<PromptInputTextarea placeholder="e.g. Add a dark mode toggle to the header" />
				</PromptInputBody>
				<PromptInputFooter>
					<PromptInputSubmit status={status === 'idle' ? undefined : status} />
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
