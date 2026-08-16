"""Frame-Cache fuer Embeddings.

Laut ADR 002 ist das hier keine Optimierung, sondern die tragende Konstruktion:
ohne Cache kostet jeder Klick 280 ms statt 11 ms. Der Cache ist der Unterschied
zwischen einem Werkzeug und einer Warteschlange.

Gehalten wird nach Frame-Index, verdraengt wird nach LRU mit einem Speicherbudget.
Bei `sam2.1_hiera_tiny` liegt ein Embedding bei etwa 14 MB (fp16), ein Budget von
2 GB fasst also rund 140 Frames -- genug fuer die Nachbarschaft, in der gearbeitet
wird, und weit unter den 16 GB der Karte.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict

from .models.base import Embedding

log = logging.getLogger("rotoscope.cache")

DEFAULT_BUDGET_BYTES = 2 * 1024**3


class EmbeddingCache:
    """LRU-Cache mit Speicherbudget statt Elementanzahl.

    Elementanzahl waere die falsche Groesse: ein Embedding von `base_plus` ist
    deutlich groesser als eines von `tiny`, und das Budget soll VRAM begrenzen,
    nicht Eintraege zaehlen.
    """

    def __init__(self, budget_bytes: int = DEFAULT_BUDGET_BYTES):
        self.budget_bytes = budget_bytes
        self._entries: OrderedDict[tuple[str, int], Embedding] = OrderedDict()
        self._bytes = 0
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, variant: str, frame: int) -> Embedding | None:
        key = (variant, frame)
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                self.misses += 1
                return None
            self._entries.move_to_end(key)
            self.hits += 1
            return entry

    def put(self, variant: str, frame: int, embedding: Embedding) -> None:
        key = (variant, frame)
        with self._lock:
            if key in self._entries:
                self._bytes -= self._entries.pop(key).nbytes
            self._entries[key] = embedding
            self._bytes += embedding.nbytes
            self._evict()

    def _evict(self) -> None:
        """Aeltestes zuerst, bis das Budget wieder passt. Aufrufer haelt den Lock."""
        while self._bytes > self.budget_bytes and len(self._entries) > 1:
            _, dropped = self._entries.popitem(last=False)
            self._bytes -= dropped.nbytes

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._bytes = 0

    def stats(self) -> dict:
        with self._lock:
            total = self.hits + self.misses
            return {
                "frames": len(self._entries),
                "bytes": self._bytes,
                "mb": round(self._bytes / 1024**2, 1),
                "budget_mb": round(self.budget_bytes / 1024**2),
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate": round(self.hits / total, 3) if total else None,
            }
