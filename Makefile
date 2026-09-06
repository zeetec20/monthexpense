.PHONY: install install-fe install-be \
        dev-fe dev-be \
        build-fe \
        test-fe test-be \
        typecheck-be \
        deploy-fe deploy-be \
        tunnel-fe tunnel-be

install: install-fe install-be

install-fe:
	cd fe && bun install

install-be:
	cd be && bun install

dev-fe:
	cd fe && bun run dev

dev-be:
	cd be && bun run dev

build-fe:
	cd fe && bun run build

test-fe:
	cd fe && bun run test

test-be:
	cd be && bun run test

typecheck-be:
	cd be && bun run typecheck

deploy-fe:
	cd fe && bun run deploy

deploy-be:
	cd be && bun run deploy

# Cloudflare quick tunnel (replaces ngrok) — ephemeral public HTTPS URL,
# no account/config needed. Run the matching dev-* target in another
# terminal first.
tunnel-fe:
	cloudflared tunnel --url http://localhost:5173

tunnel-be:
	cloudflared tunnel --url http://localhost:8787
