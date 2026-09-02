import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	// Cloudflare Workers bindings/vars, not exposed to the browser.
	const AGENT_WORKER_URL = env.AGENT_WORKER_URL;
	const APP_REPO_URL = env.APP_REPO_URL;
	const AGENT_SHARED_SECRET = env.AGENT_SHARED_SECRET;

	if (!AGENT_WORKER_URL || !APP_REPO_URL || !AGENT_SHARED_SECRET) {
		return Response.json(
			{ error: 'Server is missing AGENT_WORKER_URL, APP_REPO_URL, or AGENT_SHARED_SECRET.' },
			{ status: 500 },
		);
	}

	let task: string | undefined;
	let pagePath: string | undefined;
	try {
		const body = (await request.json()) as { task?: unknown; pagePath?: unknown };
		task = typeof body.task === 'string' ? body.task : undefined;
		pagePath = typeof body.pagePath === 'string' ? body.pagePath : undefined;
	} catch {
		return Response.json({ error: 'invalid JSON body' }, { status: 400 });
	}
	if (!task || typeof task !== 'string') {
		return Response.json({ error: '"task" is required' }, { status: 400 });
	}

	let workerRes: Response;
	try {
		workerRes = await fetch(AGENT_WORKER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Agent-Secret': AGENT_SHARED_SECRET },
			body: JSON.stringify({ repo: APP_REPO_URL, task, pagePath }),
			// The agent clones the repo, runs Claude Code, installs deps,
			// builds, and publishes a preview - can take a while. This whole
			// call streams (SSE) rather than waiting for it all to finish.
			signal: AbortSignal.timeout(5 * 60 * 1000),
		});
	} catch (err) {
		return Response.json(
			{ error: `Could not reach agent worker at ${AGENT_WORKER_URL}: ${err instanceof Error ? err.message : err}` },
			{ status: 502 },
		);
	}

	// Proxy the SSE stream straight through to the browser rather than
	// buffering - the whole point is that the browser sees progress live.
	return new Response(workerRes.body, {
		status: workerRes.status,
		headers: { 'Content-Type': workerRes.headers.get('Content-Type') ?? 'application/json' },
	});
};
