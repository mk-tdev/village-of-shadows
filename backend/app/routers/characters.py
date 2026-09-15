"""Photo-derived character art. Only generated art is retained, never source photos."""
import asyncio
import base64
from collections import deque
from io import BytesIO
import secrets
import time

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.config import settings
from app.game import access, registry

router = APIRouter(tags=["characters"])
lobby_lock = asyncio.Lock()
_generation_slots = asyncio.Semaphore(2)
_generation_times: deque[float] = deque()
MAX_UPLOAD = 8 * 1024 * 1024
PROMPT = """Create a photorealistic full-length human character for Village of Shadows,
 an atmospheric medieval forest village horror game. Preserve the reference person's
 recognizable face, facial proportions, age, skin tone, hairstyle and gender presentation.
 Do not beautify, caricature, make a doll, or change them into a monster. Weathered wool
 coat, layered village clothing and practical boots; understated firelight rim lighting.
 Face clearly visible, no mask or hood, realistic skin texture. One person only, standing
 naturally facing camera, entire head and boots visible, centered, modest margins.
 Head centered horizontally in the upper 5-22 percent of the canvas. Transparent
 background, isolated figure, no scenery, props, text, weapons or gore."""


def normalize_photo(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as original:
            if original.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("format")
            if original.width * original.height > 25_000_000 or min(original.size) < 128:
                raise ValueError("dimensions")
            image = ImageOps.exif_transpose(original).convert("RGB")
            image.thumbnail((1536, 1536))
            output = BytesIO()
            image.save(output, "PNG")  # Strip EXIF/location metadata before sending.
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(400, "Choose a valid JPEG, PNG or WebP photo, at least 128px and at most 25 megapixels.") from exc


def prepare_art(data: bytes) -> tuple[bytes, bytes]:
    with Image.open(BytesIO(data)) as source:
        if source.width * source.height > 8_500_000:
            raise ValueError("Generated image too large")
        image = source.convert("RGBA")
        full = BytesIO()
        image.save(full, "WEBP", quality=92)
        w, h = image.size
        portrait = image.crop((int(w * .27), 0, int(w * .73), int(h * .31)))
        portrait.thumbnail((384, 384))
        face = BytesIO()
        portrait.save(face, "WEBP", quality=94)
        return full.getvalue(), face.getvalue()


async def generate_art(photo: bytes) -> tuple[bytes, bytes]:
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            data={"model": settings.character_image_model, "prompt": PROMPT,
                  "size": "1024x1536", "quality": "medium",
                  "background": "transparent", "output_format": "png"},
            files={"image": ("reference.png", photo, "image/png")},
        )
    if response.status_code >= 400:
        raise HTTPException(502, "Character generation was unavailable or the photo could not be processed. Try another photo or keep the default character.")
    try:
        raw = base64.b64decode(response.json()["data"][0]["b64_json"], validate=True)
        return await asyncio.to_thread(prepare_art, raw)
    except (ValueError, KeyError, IndexError, OSError) as exc:
        raise HTTPException(502, "The image service returned unusable character art.") from exc


@router.post("/characters/generate")
async def generate_character(request: Request):
    if not settings.openai_api_key:
        raise HTTPException(503, "Character generation needs the server's OpenAI API key.")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Photo must be smaller than 8 MB.")
    photo = await asyncio.to_thread(normalize_photo, bytes(data))
    now = time.monotonic()
    while _generation_times and _generation_times[0] < now - 3600:
        _generation_times.popleft()
    # A deployment-wide ceiling bounds spend on this pre-login setup endpoint.
    if len(_generation_times) >= 30 or _generation_slots.locked():
        raise HTTPException(429, "Character studio is busy. Please try again later.")
    _generation_times.append(now)
    async with _generation_slots:
        try:
            full, portrait = await generate_art(photo)
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Image service timed out. Keep your default character or try again.") from exc
    character_id = secrets.token_hex(32)
    conn = request.app.state.db_conn
    await conn.execute("INSERT INTO character_assets (id, image, portrait) VALUES (?, ?, ?)",
                       (character_id, full, portrait))
    await conn.commit()
    return {"character_id": character_id}


async def require_character(conn, character_id: str):
    cursor = await conn.execute("SELECT 1 FROM character_assets WHERE id = ?", (character_id,))
    if await cursor.fetchone() is None:
        raise HTTPException(404, "Character preview expired or was not found. Please generate it again.")


@router.get("/characters/{character_id}/{variant}")
async def character_image(character_id: str, variant: str, request: Request):
    if variant not in {"full", "portrait"} or len(character_id) != 64:
        raise HTTPException(404, "Character not found.")
    column = "image" if variant == "full" else "portrait"
    cursor = await request.app.state.db_conn.execute(
        f"SELECT {column} FROM character_assets WHERE id = ?", (character_id,))
    row = await cursor.fetchone()
    if row is None:
        raise HTTPException(404, "Character not found.")
    # Unguessable capability URL: anyone in the room can see its shared cast art.
    return Response(bytes(row[0]), media_type="image/webp", headers={
        "Cache-Control": "private, max-age=86400", "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff"})


class CharacterChoice(BaseModel):
    character_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


@router.put("/games/{session_id}/character")
async def choose_character(session_id: str, choice: CharacterChoice, request: Request,
                           seat_id: str, access_token: str):
    conn = request.app.state.db_conn
    viewer = await access.authorize(conn, session_id, seat_id=seat_id, access_token=access_token)
    if viewer is None or viewer.seat_id != seat_id:
        raise HTTPException(403, "Use your own seat invitation to change your character.")
    try:
        orch = registry.get(session_id)
    except KeyError:
        raise HTTPException(404, "Room not found.")
    async with lobby_lock:
        if orch.started:
            raise HTTPException(409, "Choose your character before the host starts the game.")
        player = orch.state.find_seat(seat_id)
        if player is None or player.controller != "human":
            raise HTTPException(403, "Only human players can change their character.")
        if choice.character_id:
            await require_character(conn, choice.character_id)
        # Update one seat atomically so simultaneous participants cannot overwrite each other.
        await conn.execute("""UPDATE game_configs SET seats_json = (
            SELECT jsonb_agg(CASE WHEN item->>'seat_id' = ?
                THEN item || jsonb_build_object('character_id', CAST(? AS text)) ELSE item END)::text
            FROM jsonb_array_elements(seats_json::jsonb) item
        ) WHERE game_id = ?""", (seat_id, choice.character_id, session_id))
        await conn.commit()
        player.character_id = choice.character_id
        orch.publish("character_updated", {"seat_id": seat_id, "character_id": choice.character_id})
    return {"ok": True}
