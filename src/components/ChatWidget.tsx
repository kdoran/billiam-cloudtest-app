import { useState } from 'react';
import { MessageCircleIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// A small floating widget (button -> popover panel), not a full-page chat -
// this sits *on top of* a static page, it doesn't replace it. AI Elements
// components, but fed from our own hand-rolled SSE stream (see
// agentEvents.ts) rather than the Vercel AI SDK's useChat - that hook
// expects a backend speaking its own message-stream protocol from a direct
// model call, and what's actually streaming here is a multi-step pipeline
// (clone -> Claude Code -> install -> build -> commit -> deploy), not model
// tokens. The components don't care what fed them, so they still fit fine.
//
// Unlike the homepage's console-style log box, this only ever shows a
// friendly one-line status while working (never the raw diff/npm/wrangler
// output the pipeline emits as 'log' events) and a clean final summary -
// a chat bubble reads as noise once it's full of `git diff` hunks.
export default function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [workingStatus, setWorkingStatus] = useState<string | null>(null);
	const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming' | 'error'>('idle');

	function addAssistantMessage(text: string) {
		setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text }]);
	}

	async function handleSubmit(message: PromptInputMessage) {
		const task = message.text.trim();
		if (!task || status === 'submitted' || status === 'streaming') return;

		setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: task }]);
		setStatus('submitted');
		setWorkingStatus('Starting…');

		try {
			const body = await applyTask(task);
			setStatus('streaming');
			let doneResult: { logs: string; appUrl: string } | null = null;
			for await (const event of readAgentEvents(body)) {
				if (event.type === 'status') {
					setWorkingStatus(event.message);
				} else if (event.type === 'done') {
					doneResult = event;
				} else if (event.type === 'error') {
					throw new Error(event.message);
				}
				// 'log' events (raw diff/npm/wrangler output) are intentionally
				// not shown here - see the homepage's log box for that detail.
			}
			setWorkingStatus(null);
			if (doneResult) {
				addAssistantMessage(`${doneResult.logs || 'Done.'}\n\nLive now - reloading…`);
				window.location.reload();
				return;
			}
			setStatus('idle');
		} catch (err) {
			setWorkingStatus(null);
			addAssistantMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
			setStatus('error');
		}
	}

	if (!open) {
		return (
			<Button
				className="fixed right-6 bottom-6 z-50 size-14 rounded-full shadow-lg"
				onClick={() => setOpen(true)}
				aria-label="Open chat"
			>
				<MessageCircleIcon className="size-6" />
			</Button>
		);
	}

	return (
		<div className="fixed right-6 bottom-6 z-50 flex h-[32rem] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<span className="font-medium text-sm">Ask the agent</span>
				<Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close chat">
					<XIcon className="size-4" />
				</Button>
			</div>

			<Conversation className="min-h-0 flex-1">
				<ConversationContent>
					{messages.map((m) => (
						<Message key={m.id} from={m.role}>
							<MessageContent>
								<div className="whitespace-pre-wrap text-sm">{m.text}</div>
							</MessageContent>
						</Message>
					))}
					{workingStatus && (
						<Message from="assistant">
							<MessageContent>
								<div className="flex items-center gap-2 text-muted-foreground text-sm italic">
									<span className="size-2 animate-pulse rounded-full bg-current" />
									{workingStatus}
								</div>
							</MessageContent>
						</Message>
					)}
				</ConversationContent>
				<ConversationScrollButton />
			</Conversation>

			<PromptInput onSubmit={handleSubmit} className="border-t p-2">
				<PromptInputBody>
					<PromptInputTextarea placeholder="Describe a change…" />
				</PromptInputBody>
				<PromptInputFooter>
					<PromptInputSubmit status={status === 'idle' ? undefined : status} />
				</PromptInputFooter>
			</PromptInput>
		</div>
	);
}
