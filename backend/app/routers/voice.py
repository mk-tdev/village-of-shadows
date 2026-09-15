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


@router.post("/{session_id}/transcribe")
async def transcribe_council(
    session_id: str, request: Request, language: str = "en",
    seat_id: str | None = None, access_token: str | None = None,
    host_token: str | None = None,
) -> dict:
    """Transcribe a human's current turn; never submit a game action implicitly."""
    import httpx
    from app.config import settings
    from app.game import registry

    viewer = await access.authorize(request.app.state.db_conn, session_id,
        seat_id=seat_id, access_token=access_token, host_token=host_token)
    if viewer is None or viewer.seat_id is None or viewer.seat_id != seat_id:
        raise HTTPException(403, "A human seat credential is required.")
    if language not in {"en", "zh"}:
        raise HTTPException(422, "Choose English or Chinese.")
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(409, "This game is not active.") from None
    prompt = orch.state.awaiting
    if prompt is None or prompt.seat_id != seat_id or prompt.kind not in {"statement", "werewolf_negotiation", "vote", "night_action"}:
        raise HTTPException(409, "Wait for your speaking or decision turn.")
    mime = request.headers.get("content-type", "").split(";")[0]
    formats = {"audio/webm":"webm", "audio/mp4":"mp4", "audio/ogg":"ogg", "audio/wav":"wav", "audio/mpeg":"mp3"}
    if mime not in formats:
        raise HTTPException(415, "Unsupported audio format.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(413, "Recording is too large. Keep it under one minute.")
    if not data:
        raise HTTPException(422, "The recording is empty.")
    if not settings.openai_api_key:
        raise HTTPException(503, "AI transcription is not configured. You can still type.")
    # Attempts are bounded per turn; entries disappear with the orchestrator.
    counts = getattr(orch, "_transcription_counts", {})
    key = (seat_id, prompt.turn_id or f"{orch.state.round}:{orch.state.phase}:{prompt.kind}")
    if counts.get(key, 0) >= 8:
        raise HTTPException(429, "Transcription limit reached for this turn. You can still type.")
    counts[key] = counts.get(key, 0) + 1
    orch._transcription_counts = counts
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            result = await client.post("https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                data={"model": settings.openai_transcribe_model, "language": language,
                      "prompt": "Village of Shadows. Names: " + ", ".join(p.name for p in orch.state.players)},
                files={"file": (f"council.{formats[mime]}", bytes(data), mime)})
            result.raise_for_status()
            text = result.json().get("text", "").strip()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Could not transcribe. Try again or type your words.") from None
    return {"text": text[:2000], "language": language}
