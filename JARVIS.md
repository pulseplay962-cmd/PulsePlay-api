# PulsePlay JARVIS

PulsePlay JARVIS is the private AI command layer for PulsePlay.

## Current foundation

- Protected JARVIS API endpoints
- OpenAI-powered conversation with allowlisted read-only function tools
- Supabase long-term memory and session records
- Audit logging
- System health snapshot
- Persistent memory and approval request endpoints
- Admin-session-protected HUD endpoints

## Read-only tool registry

The chat model may request only these tools:

- `get_pulseplay_system_status`: reads the API/database/configuration health snapshot.
- `list_jarvis_memories`: reads stored memories.
- `list_pending_approvals`: reads pending approval records.

The server validates every requested tool against a fixed allowlist and executes the implementation itself. Tool arguments are parsed as JSON and limits are clamped. Tool calls are audited.

**No tool in this phase can publish content, deploy software, edit production configuration, delete data, approve/reject requests, or execute other state-changing operations.** An approval record represents authorization intent only; it does not trigger execution.

## Environment

Add these variables to the PulsePlay API service:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JARVIS_API_KEY`
- `JARVIS_MODEL` (optional; defaults to `gpt-4.1-mini`)
- `JARVIS_ADMIN_USER_IDS` (comma-separated Supabase user UUIDs authorized for HUD endpoints)
- `JARVIS_ADMIN_EMAILS` (comma-separated email addresses authorized for HUD endpoints)

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `JARVIS_API_KEY` to the browser.

## API-key endpoints

These endpoints require `X-Jarvis-Key` or `Authorization: Bearer` with `JARVIS_API_KEY`:

- `GET /api/jarvis/health`
- `GET /api/jarvis/memory`
- `POST /api/jarvis/memory`
- `POST /api/jarvis/sessions`
- `POST /api/jarvis/chat`

## Admin-session endpoints

These endpoints require a valid Supabase access token **and** an admin role in Supabase `app_metadata` (`role: admin` or `roles: [admin]`), or a matching user UUID/email in the server-side `JARVIS_ADMIN_USER_IDS` / `JARVIS_ADMIN_EMAILS` allowlist. If no admin identity matches, the API denies access by default.

- `GET /api/jarvis/ui/health`
- `GET /api/jarvis/ui/memory`
- `POST /api/jarvis/ui/memory`
- `GET /api/jarvis/ui/approvals`
- `POST /api/jarvis/ui/approvals`
- `POST /api/jarvis/ui/approvals/:id/resolve`
- `POST /api/jarvis/ui/chat`

## Next phases

1. Expand CI coverage and verify end-to-end read-only tool behavior in a non-production environment.
2. Add narrowly scoped external integrations (GitHub/Render) as read-only tools.
3. Add approval-bound execution for specific actions, with validation and audit logging.
4. Add voice input/output.
5. Consider controlled browser/computer actions only after tool permissions and auditing are established.
