from fastapi import APIRouter, HTTPException, Request, Response

from app.game import access, voice

router = APIRouter(prefix="/games", tags=["voice"])


@router.post("/{session_id}/voice/{seq}")
async def council_voice(
    session_id: str,
    seq: int,
    request: Request,
    seat_id: str | None = None,
    access_token: str | None = None,
    host_token: str | None = None,
) -> Response:
    viewer = await access.authorize(
        request.app.state.db_conn,
        session_id,
        seat_id=seat_id,
        access_token=access_token,
        host_token=host_token,
    )
    if viewer is None:
        raise HTTPException(403, "This room credential does not permit voice playback.")
    try:
        audio, content_type = await voice.get_or_create_council_audio(
            request.app.state.db_conn, session_id, seq,
        )
    except voice.VoiceLineNotFoundError:
        raise HTTPException(404, "That event is not a public council statement.") from None
    except voice.VoiceUnavailableError as exc:
        raise HTTPException(503, str(exc)) from None
    return Response(
        content=audio,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
