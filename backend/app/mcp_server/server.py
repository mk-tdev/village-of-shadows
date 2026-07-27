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

# Tools a model is allowed to see and call. `bind_seat` is deliberately
# excluded — see agent_turn.py, which filters the tool list by this set
# before binding tools to a chat model.
MODEL_VISIBLE_TOOLS = {
    "get_public_transcript",
    "get_my_private_context",
    "get_vote_history",
    "get_my_notes",
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
    """Retrieve this seat's own past private scratchpad notes."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.get_notes(orch, seat_id)


@mcp.tool()
async def write_note(note: str, ctx: Context) -> dict:
    """Persist a private scratchpad note for future rounds."""
    game_id, seat_id = identity.resolve(ctx.session)
    orch = registry.get(game_id)
    return await actions.write_note(orch, seat_id, note)


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
