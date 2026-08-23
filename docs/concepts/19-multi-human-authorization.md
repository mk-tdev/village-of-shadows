# 19. Multiple humans and browser authorization

**Files:** [`access.py`](../../backend/app/game/access.py),
[`views.py`](../../backend/app/game/views.py),
[`stream.py`](../../backend/app/routers/stream.py), and
[`RoomLobby.tsx`](../../frontend/components/RoomLobby.tsx).

## A seat link is an authorization boundary

Creating a room produces a host secret and one random secret per human seat.
Only hashes are stored. A token is accepted only with its exact game and seat,
so changing `seat_id` in the URL cannot borrow another character's knowledge.
The host can rotate a leaked link or permanently release an absent human seat
to the validated offline agent.

Every REST state response and every SSE event is projected on the server.
Ordinary browsers receive public events, their own pending interrupt, their
own role-private action, living-werewolf teammate information when applicable,
and their own Seer results. They never receive other seats' prompts, custom
agent configuration, provider endpoints, notes, beliefs, or relationship
memory. God Mode is a host capability, not a client-side toggle.

LangGraph still owns one world. It simply suspends for whichever human seat
owns the next node. Different browsers answer sequential interrupts through
the same action validation used by an AI's bound MCP tool.
