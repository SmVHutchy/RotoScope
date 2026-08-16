"""Roto-Sitzungen: Frames, Embeddings, Prompt-Punkte pro Objekt.

Deckt aus M1 ab: UC-A1 (freistellen), UC-A2 (mehrere Objekte), UC-A3 (Korrektur
ohne Tracking-Verlust). Der Punkt bei UC-A3 ist, dass Punkte *akkumuliert* werden
und nie ein Reset noetig ist -- ein zusaetzlicher Klick verfeinert, er beginnt nicht neu.

Frames kommen aus dem Browser (mediabunny dekodiert dort ohnehin schon). Die Engine
muss damit keine Container und Codecs kennen -- das bleibt an einer Stelle im Projekt.
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field

import numpy as np

from .cache import EmbeddingCache
from .models import Point, get_segmenter

log = logging.getLogger("rotoscope.roto")


@dataclass
class RotoObject:
    """Ein getracktes Objekt mit seiner Prompt-Historie."""

    id: str
    points: dict[int, list[Point]] = field(default_factory=dict)

    def add(self, frame: int, point: Point) -> list[Point]:
        self.points.setdefault(frame, []).append(point)
        return self.points[frame]


@dataclass
class Session:
    id: str
    variant: str
    cache: EmbeddingCache
    objects: dict[str, RotoObject] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def object(self, object_id: str) -> RotoObject:
        if object_id not in self.objects:
            self.objects[object_id] = RotoObject(id=object_id)
        return self.objects[object_id]


_sessions: dict[str, Session] = {}
_sessions_lock = threading.Lock()


def create_session(variant: str | None = None) -> Session:
    segmenter = get_segmenter(variant)  # laedt jetzt, nicht beim ersten Klick
    session = Session(id=uuid.uuid4().hex[:12], variant=segmenter.variant, cache=EmbeddingCache())
    with _sessions_lock:
        _sessions[session.id] = session
    log.info("Sitzung %s mit %s", session.id, session.variant)
    return session


def get_session(session_id: str) -> Session:
    with _sessions_lock:
        session = _sessions.get(session_id)
    if session is None:
        raise KeyError(session_id)
    return session


def drop_session(session_id: str) -> None:
    with _sessions_lock:
        session = _sessions.pop(session_id, None)
    if session:
        session.cache.clear()


def embed_frame(session: Session, frame: int, image: np.ndarray) -> tuple[bool, float]:
    """Embedding sicherstellen. Gibt (war_im_cache, dauer_ms) zurueck."""
    cached = session.cache.get(session.variant, frame)
    if cached is not None:
        return True, 0.0

    segmenter = get_segmenter(session.variant)
    embedding = segmenter.encode(image)
    session.cache.put(session.variant, frame, embedding)
    return False, embedding.encode_ms


def click(
    session: Session,
    frame: int,
    object_id: str,
    point: Point,
    image: np.ndarray | None = None,
) -> dict:
    """Punkt hinzufuegen und Maske neu berechnen.

    Der Punkt wird zur Historie des Objekts *hinzugefuegt*, nicht ersetzt: genau
    das ist UC-A3. Wer auf Frame 47 korrigiert, verliert nichts von 1 bis 46.
    """
    with session.lock:
        embedding = session.cache.get(session.variant, frame)
        if embedding is not None and not (
            0 <= point.x < embedding.width and 0 <= point.y < embedding.height
        ):
            # SAM 2 quittiert Punkte ausserhalb des Bildes nicht mit einem Fehler,
            # sondern mit einer Vollbildmaske und Score ~0. Das sieht aus wie ein
            # Modellversagen und ist in Wahrheit ein ungueltiger Aufruf.
            raise ValueError(
                f"Punkt ({point.x:.0f}, {point.y:.0f}) liegt ausserhalb des Frames "
                f"({embedding.width}x{embedding.height})."
            )

        if embedding is None:
            if image is None:
                raise LookupError(
                    f"Frame {frame} ist nicht im Cache und es wurde kein Bild mitgeschickt."
                )
            segmenter = get_segmenter(session.variant)
            embedding = segmenter.encode(image)
            session.cache.put(session.variant, frame, embedding)

        obj = session.object(object_id)
        points = obj.add(frame, point)

        segmenter = get_segmenter(session.variant)
        result = segmenter.predict(embedding, points)

    return {
        "object_id": object_id,
        "frame": frame,
        "points": len(points),
        "score": round(result.score, 4),
        "predict_ms": result.predict_ms,
        "mask": result.mask,
    }
