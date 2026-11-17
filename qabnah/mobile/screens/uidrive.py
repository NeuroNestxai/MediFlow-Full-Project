"""Tiny adb UI driver for the screenshot runs: find elements by text / content description, tap, type, screenshot.

Used by android_screens.py on a CI emulator. Every step is best-effort: a failed step is logged, the screen is still
photographed, and the run continues — the goal is real screenshots of the real apps talking to the real backend.
"""
from __future__ import annotations

import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def adb(*args: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(["adb", *args], capture_output=True, timeout=timeout, check=False)


def shell(cmd: str, timeout: int = 60) -> str:
    return adb("shell", cmd, timeout=timeout).stdout.decode(errors="replace")


def dump() -> ET.Element:
    for _ in range(4):
        try:
            out = adb("exec-out", "uiautomator", "dump", "/dev/tty", timeout=45).stdout.decode(errors="replace")
        except subprocess.TimeoutExpired:
            out = ""
        i, j = out.find("<?xml"), out.rfind("</hierarchy>")
        if i >= 0 and j > i:
            try:
                return ET.fromstring(out[i : j + len("</hierarchy>")])
            except ET.ParseError:
                pass
        time.sleep(1.5)
    return ET.fromstring("<hierarchy/>")


def labels(root: ET.Element | None = None) -> list[str]:
    root = root if root is not None else dump()
    seen: list[str] = []
    for n in root.iter("node"):
        for key in ("text", "content-desc"):
            v = (n.get(key) or "").strip()
            if v and v not in seen:
                seen.append(v)
    return seen


def find_all(pattern: str, root: ET.Element | None = None) -> list[ET.Element]:
    root = root if root is not None else dump()
    rx = re.compile(pattern)
    return [n for n in root.iter("node") if any((n.get(key) or "") and rx.search(n.get(key) or "") for key in ("text", "content-desc"))]


def find(pattern: str, root: ET.Element | None = None, lowest: bool = False) -> ET.Element | None:
    """First match in reading order, or with lowest=True the match nearest the bottom of the screen (tab bars)."""
    nodes = find_all(pattern, root)
    if not nodes:
        return None
    return max(nodes, key=lambda n: center(n)[1]) if lowest else nodes[0]


def center(node: ET.Element) -> tuple[int, int]:
    x1, y1, x2, y2 = map(int, re.findall(r"-?\d+", node.get("bounds") or "[0,0][0,0]"))
    return (x1 + x2) // 2, (y1 + y2) // 2


def wait_for(pattern: str, timeout: float = 25, lowest: bool = False) -> ET.Element:
    end = time.time() + timeout
    while True:
        node = find(pattern, lowest=lowest)
        if node is not None:
            return node
        if time.time() > end:
            raise TimeoutError(f"not on screen: /{pattern}/")
        time.sleep(1)


def tap(pattern: str, timeout: float = 25, lowest: bool = False) -> None:
    x, y = center(wait_for(pattern, timeout, lowest))
    shell(f"input tap {x} {y}")
    time.sleep(1.2)


def tap_xy(x: int, y: int) -> None:
    shell(f"input tap {x} {y}")
    time.sleep(1.0)


def type_text(text: str) -> None:
    shell(f"input text '{text}'")
    time.sleep(0.6)


def back() -> None:
    shell("input keyevent 4")
    time.sleep(1.0)


def swipe_up(fraction: float = 0.5) -> None:
    w, h = screen_size()
    shell(f"input swipe {w // 2} {int(h * 0.75)} {w // 2} {int(h * (0.75 - fraction))} 350")
    time.sleep(1.0)


def screen_size() -> tuple[int, int]:
    m = re.search(r"(\d+)x(\d+)", shell("wm size"))
    return (int(m.group(1)), int(m.group(2))) if m else (1080, 2400)


class Session:
    def __init__(self, out_dir: str, prefix: str) -> None:
        self.out = Path(out_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.prefix = prefix
        self.n = 0
        self.failed: list[str] = []

    def shot(self, name: str) -> None:
        self.n += 1
        png = adb("exec-out", "screencap", "-p", timeout=60).stdout
        path = self.out / f"{self.prefix}-{self.n:02d}-{name}.png"
        if png[:4] == b"\x89PNG":
            path.write_bytes(png)
            print(f"   saved {path.name} ({len(png) // 1024} kB)")
        else:
            print(f"   !! screencap returned no PNG for {name}")

    def step(self, name: str, fn, settle: float = 2.0) -> bool:
        print(f"== {self.prefix}: {name}")
        ok = True
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 — best effort by design
            ok = False
            self.failed.append(name)
            print(f"   !! step failed: {exc}")
        time.sleep(settle)
        self.shot(name)
        print("   on screen: " + " | ".join(labels()[:40]))
        sys.stdout.flush()
        return ok
