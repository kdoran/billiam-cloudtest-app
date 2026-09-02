import type { APIRoute } from 'astro';

export const prerender = false;

// Runs on the Node server. Never exposed to the browser.
const AGENT_WORKER_URL = process.env.AGENT_WORKER_URL;
const APP_REPO_URL = process.env.APP_REPO_URL;

export const POST: APIRoute = async ({ request }) => {
	if (!AGENT_WORKER_URL || !APP_REPO_URL) {
		return Response.json(
			{ error: 'Server is missing AGENT_WORKER_URL or APP_REPO_URL. See app/.env.example.' },
			{ status: 500 },
		);
	}

	let task: string | undefined;
	try {
		({ task } = await request.json());
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
