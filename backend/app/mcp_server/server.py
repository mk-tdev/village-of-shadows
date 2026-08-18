"""The game-tools MCP server. Plan §6.2.

Mounted in-process at /mcp (see app/main.py) so it shares the same event
loop and game registry as the FastAPI app, with no subprocess management.
Tool handlers never accept a `seat_id` argument — identity comes from
`identity.resolve(ctx.session)`, bound once per connection by `bind_seat`
(see identity.py for why that specific tool is never shown to a model).
"""

from mcp.server.fastmcp import Context, FastMCP

from app.game import actions, registry
from app.mcp_server import identity

mcp = FastMCP("game-tools")
# FastMCP's streamable_http_app() registers its own internal route at
# "/mcp" by default. main.py mounts that whole app *again* under "/mcp",
# which would make the real endpoint "/mcp/mcp" while every client (see
# settings.mcp_url) expects plain "/mcp". Pointing the internal route at
# "/" instead means mount prefix + internal route == "/mcp", matching what
# clients actually connect to.
mcp.settings.streamable_http_path = "/"

# Tools a model is allowed to see and call. `bind_seat` is deliberately
# excluded — see agent_turn.py, which filters the tool list by this set
# before binding tools to a chat model.
MODEL_VISIBLE_TOOLS = {
    "get_public_transcript",
    "get_my_private_context",
    "get_vote_history",
    "get_my_notes",
    "get_my_note_history",
    "record_private_note",
    "revise_private_note",
    "retire_private_note",
    "write_note",
    "negotiate_message",
    "submit_night_action",
    "submit_statement",
    "submit_vote",
}


@mcp.tool()
async def bind_seat(token: str, ctx: Context) -> dict:
    """Internal: bind this connection to a seat identity. Not for model use."""
    game_id, seat_id = identity.bind(ctx.session, token)
    return {"ok": True, "game_id": game_id, "seat_id": seat_id}


@mcp.tool()
def get_public_transcript(ctx: Context) -> list[dict]:
    """Read the public log for the current game (all rounds so far)."""
    game_id, _ = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return actions.get_public_transcript(orch)


@mcp.tool()
def get_my_private_context(ctx: Context) -> dict:
    """Your role, teammate (if werewolf), and known roles (if seer)."""
    from app.game.views import build_agent_view

    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return build_agent_view(orch.state, seat_id)


@mcp.tool()
async def get_vote_history(ctx: Context) -> list[dict]:
    """Past rounds' vote tallies for this game."""
    game_id, _ = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.get_vote_history(orch)


@mcp.tool()
async def get_my_notes(ctx: Context) -> list[str]:
    """Retrieve the latest active content from this seat's private notebook."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.get_notes(orch, seat_id)


@mcp.tool()
async def write_note(note: str, ctx: Context) -> dict:
    """Legacy shorthand: create a private note classified as a theory."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.write_note(orch, seat_id, note)


@mcp.tool()
async def get_my_note_history(ctx: Context) -> list[dict]:
    """Retrieve only your own immutable private-note history, including retired theories."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.get_note_history(orch, seat_id)


@mcp.tool()
async def record_private_note(
    kind: str,
    content: str,
    subject: str = "",
    source_seq: int | None = None,
    ctx: Context = None,
) -> dict:
    """Create a private suspicion, clue, theory, lie, or alliance note; optionally cite a visible event seq."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.record_private_note(
        orch, seat_id, kind=kind, content=content, subject=subject, source_seq=source_seq,
    )


@mcp.tool()
async def revise_private_note(
    note_id: str,
    content: str,
    source_seq: int | None = None,
    ctx: Context = None,
) -> dict:
    """Revise one of your active notes without deleting its earlier versions."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.revise_private_note(
        orch, seat_id, note_id=note_id, content=content, source_seq=source_seq,
    )


@mcp.tool()
async def retire_private_note(
    note_id: str,
    reason: str,
    source_seq: int | None = None,
    ctx: Context = None,
) -> dict:
    """Retire a disproved or obsolete note while preserving its full history."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.retire_private_note(
        orch, seat_id, note_id=note_id, reason=reason, source_seq=source_seq,
    )


@mcp.tool()
async def negotiate_message(text: str, ctx: Context) -> dict:
    """Send a message in the private werewolf channel. Werewolves only."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.negotiate_message(orch, seat_id, text)


@mcp.tool()
async def submit_night_action(target: str, thought: str = "", ctx: Context = None) -> dict:
    """Commit your night action (attack / protect / investigate target)."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.apply_night_action(orch, seat_id, target, thought)


@mcp.tool()
async def submit_statement(text: str, thought: str = "", ctx: Context = None) -> dict:
    """Speak during day discussion."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.apply_statement(orch, seat_id, text, thought)


@mcp.tool()
async def submit_vote(target: str, thought: str = "", ctx: Context = None) -> dict:
    """Cast your vote to eliminate a player."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.apply_vote(orch, seat_id, target, thought)
