"""Friends made on the mountain, kept across games (SQLite)."""
from __future__ import annotations

import sqlite3
import time
from pathlib import Path


class Friends:
    def __init__(self, path: str | Path = ":memory:") -> None:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS names (pid TEXT PRIMARY KEY, name TEXT NOT NULL, seen REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, since REAL NOT NULL, PRIMARY KEY (a, b));
            """
        )

    def seen(self, pid: str, name: str) -> None:
        self.db.execute("INSERT INTO names(pid, name, seen) VALUES(?,?,?) ON CONFLICT(pid) DO UPDATE SET name=excluded.name, seen=excluded.seen",
                        (pid, name, time.time()))
        self.db.commit()

    def add(self, a: str, b: str) -> None:
        if a == b:
            return
        lo, hi = sorted((a, b))
        self.db.execute("INSERT OR IGNORE INTO friends(a, b, since) VALUES(?,?,?)", (lo, hi, time.time()))
        self.db.commit()

    def are_friends(self, a: str, b: str) -> bool:
        lo, hi = sorted((a, b))
        return self.db.execute("SELECT 1 FROM friends WHERE a=? AND b=?", (lo, hi)).fetchone() is not None

    def of(self, pid: str) -> list[dict]:
        rows = self.db.execute(
            """SELECT f.pid, COALESCE(n.name, 'Hiker') FROM (
                   SELECT b AS pid FROM friends WHERE a=? UNION SELECT a AS pid FROM friends WHERE b=?
               ) f LEFT JOIN names n ON n.pid = f.pid ORDER BY 2""",
            (pid, pid),
        ).fetchall()
        return [{"pid": r[0], "name": r[1]} for r in rows]
