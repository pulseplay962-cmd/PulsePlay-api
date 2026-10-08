# PulsePlay JARVIS

PulsePlay JARVIS is the private AI command layer for PulsePlay.

## Phase 1

- Protected JARVIS API endpoints
- OpenAI-powered conversation
- Supabase long-term memory
- JARVIS sessions
- Audit logging
- System health snapshot
- Foundation for approval-gated tools

## Environment

Add these variables to the PulsePlay API service:

- OPENAI_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- JARVIS_API_KEY
- JARVIS_MODEL (optional; defaults to gpt-4.1-mini)

Never expose SUPABASE_SERVICE_ROLE_KEY or JARVIS_API_KEY to the browser.

## Endpoints

All endpoints require X-Jarvis-Key or Authorization: Bearer with JARVIS_API_KEY.

- GET /api/jarvis/health
- GET /api/jarvis/memory
- POST /api/jarvis/memory
- POST /api/jarvis/sessions
- POST /api/jarvis/chat

## Next phases

1. Add tool registry and approval queue.
2. Add PulsePlay status tools.
3. Add GitHub/Render/Supabase tools.
4. Build the JARVIS HUD frontend.
5. Add voice input/output.
6. Add controlled browser/computer actions.
