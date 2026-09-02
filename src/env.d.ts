// AGENT_SHARED_SECRET is a secret (`wrangler secret put`), not declared in
// wrangler.jsonc, so `wrangler types` doesn't know about it. The `env` export
// from `cloudflare:workers` is typed as `Cloudflare.Env` specifically (not
// the bare global `Env`), so that's the interface to augment.
declare namespace Cloudflare {
	interface Env {
		AGENT_SHARED_SECRET?: string;
	}
}
