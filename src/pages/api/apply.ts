import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	// Cloudflare Workers bindings/vars, not exposed to the browser.
	const AGENT_WORKER_URL = env.AGENT_WORKER_URL;
	const APP_REPO_URL = env.APP_REPO_URL;

	if (!AGENT_WORKER_URL || !APP_REPO_URL) {
		return Response.json(
			{ error: 'Server is missing AGENT_WORKER_URL or APP_REPO_URL. See app/.env.example.' },
			{ status: 500 },
		);
	}

	let task: string | undefined;
	try {
		const body = (await request.json()) as { task?: unknown };
		task = typeof body.task === 'string' ? body.task : undefined;
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
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ repo: APP_REPO_URL, task }),
			// The agent clones the repo, runs Claude Code, installs deps and
			// boots a preview server inside a Cloudflare Sandbox - can take a while.
			signal: AbortSignal.timeout(5 * 60 * 1000),
		});
	} catch (err) {
		return Response.json(
			{ error: `Could not reach agent worker at ${AGENT_WORKER_URL}: ${err instanceof Error ? err.message : err}` },
			{ status: 502 },
		);
	}

	const body = await workerRes.text();
	return new Response(body, {
		status: workerRes.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
