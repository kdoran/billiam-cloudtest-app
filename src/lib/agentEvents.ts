// Events emitted by agent-worker's SSE stream (proxied through /api/apply
// as-is). Plain hand-rolled SSE - what's actually being streamed is a
// sandboxed shell subprocess's stdout, not model tokens, so a token-streaming
// library (like the Vercel AI SDK's useChat) doesn't fit here - see the
// AI Elements chat on /about for the UI components that *do* reuse this.
export type AgentEvent =
	| { type: 'status'; message: string }
	| { type: 'log'; stream: 'stdout' | 'stderr'; data: string }
	| { type: 'done'; logs: string; diff: string; appUrl: string }
	| { type: 'error'; message: string };

// Parses "data: {...json...}\n\n" frames out of a decoded SSE byte stream
// and yields the parsed events as they arrive.
export async function* readAgentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
	// TS's DOM lib types TextDecoderStream's writable side as
	// WritableStream<BufferSource>, which pipeThrough's stricter
	// ReadableStream<Uint8Array> signature rejects - a lib typing quirk, not
	// a real incompatibility.
	const reader = (body as ReadableStream<any>).pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += value;
		let sepIndex: number;
		while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, sepIndex);
			buffer = buffer.slice(sepIndex + 2);
			const dataLine = frame.split('\n').find((line) => line.startsWith('data:'));
			if (!dataLine) continue;
			const payload = dataLine.slice(5).trim();
			if (payload === '[DONE]') continue; // stream-end sentinel, not an event
			yield JSON.parse(payload) as AgentEvent;
		}
	}
}

// POSTs a task to /api/apply and returns its SSE body, or throws with a
// readable message if the request itself failed before streaming began.
// `pagePath` (defaults to the current page) tells the agent which page the
// request came from, so "this page" in a task description like "make this
// page monospace" resolves to the right file - without it, every page's UI
// posts to the same generic endpoint with no way to disambiguate, and the
// agent has to guess (it guessed wrong once already: a request typed on
// /about got applied to the homepage instead).
export async function applyTask(
	task: string,
	pagePath: string = window.location.pathname,
): Promise<ReadableStream<Uint8Array>> {
	const res = await fetch('/api/apply', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ task, pagePath }),
	});
	if (!res.ok || !res.body) {
		let message = `Request failed (${res.status})`;
		try {
			const data = (await res.json()) as { error?: string };
			message = data.error ?? message;
		} catch {
			/* body wasn't JSON - keep the generic message */
		}
		throw new Error(message);
	}
	return res.body;
}
