"""Run from backend: .venv/bin/python ../unreal/test_forest_api.py [--live].

Creates and removes only its own forest session; never truncates game data.
"""
import asyncio
import hashlib
import sys
import io
import wave
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import httpx
from fastapi import FastAPI
from psycopg import AsyncConnection
from app.config import settings
from app.routers import forest


async def run(live=False):
    await forest.initialize()
    app = FastAPI()
    app.include_router(forest.router)
    calls = []

    async def fake(spirit, history, text):
        calls.append((spirit, list(history)))
        return forest.Decision(reply="I remember. Carry my seal beyond the trees.", action="grant_seal")

    token = None
    context = patch.object(forest, "decide", forest.decide if live else fake)
    try:
        with context:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                payload = {"spirit": "sable", "text": "I promise to search for the child and bring her home.", "request_id": "forest-test-1"}
                assert (await client.post("/forest/talk", json=payload)).status_code == 401
                start = await client.post("/forest")
                assert start.status_code == 200, start.text
                token = start.json()["token"]
                headers = {"Authorization": "Bearer " + token}
                assert (await client.get("/forest/voice/missing")).status_code == 401
                assert (await client.get("/forest/voice/missing", headers=headers)).status_code == 404
                assert (await client.post("/forest/transcribe", headers=headers, content=b"not audio")).status_code == 422
                first = await client.post("/forest/talk", json=payload, headers=headers)
                assert first.status_code == 200, first.text
                result = first.json()
                assert result["reply"] and result["action"] in {"speak", "grant_seal", "recoil"}
                duplicate = await client.post("/forest/talk", json=payload, headers=headers)
                assert duplicate.json() == result
                conflict = await client.post("/forest/talk", json={**payload, "text": "changed"}, headers=headers)
                assert conflict.status_code == 409
                bad = await client.post("/forest/talk", json={**payload, "spirit": "invented"}, headers=headers)
                assert bad.status_code == 422
                if live:
                    print("LIVE SPIRIT VERIFIED:", result["action"], "—", result["reply"])
                    if "--voice" in sys.argv:
                        voice = await client.get("/forest/voice/forest-test-1", headers=headers)
                        assert voice.status_code == 200, voice.text
                        assert len(voice.content) > 4800 and len(voice.content) % 2 == 0
                        cached = await client.get("/forest/voice/forest-test-1", headers=headers)
                        assert cached.content == voice.content
                        buf = io.BytesIO()
                        with wave.open(buf, "wb") as wav:
                            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000)
                            wav.writeframes(voice.content[:24000*2*19])
                        transcript = await client.post("/forest/transcribe", headers=headers, content=buf.getvalue())
                        assert transcript.status_code == 200, transcript.text
                        assert len(transcript.json()["text"]) > 5
                        print("VOICE VERIFIED: generated PCM, cached replay, and speech transcription round-trip")
                else:
                    assert len(calls) == 1
                    for index, spirit in enumerate(["sable", "elin", "corvin"], start=2):
                        response = await client.post("/forest/talk", json={**payload, "spirit": spirit, "request_id": f"forest-test-{index}"}, headers=headers)
                        assert response.status_code == 200
                    assert len(calls[1][1]) == 1 and calls[2][1] == []
                    assert response.json()["complete"] is True
                    assert len(response.json()["seals"]) == 3
                    print("PASS: authentication, validation, memory isolation, duplicate suppression, conflict rejection, three-seal completion")
    finally:
        if token:
            async with await AsyncConnection.connect(settings.database_url) as conn:
                await conn.execute("DELETE FROM forest_voice WHERE token_hash=%s", (hashlib.sha256(token.encode()).hexdigest(),))
                await conn.execute("DELETE FROM forest_sessions WHERE token_hash=%s", (hashlib.sha256(token.encode()).hexdigest(),))

asyncio.run(run("--live" in sys.argv))
