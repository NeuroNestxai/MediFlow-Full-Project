#!/usr/bin/env python3
"""Drives the two Android apps on an emulator against the real backend and saves screenshots.

    python3 android_screens.py <out_dir> <consumer.apk> <captain.apk>

Expects: a booted emulator on adb, the Docker stack on the host (API :4000, merchant web :5173 for product photos),
seeded sample data, OTP_DEV_ECHO=true (the debug build shows the code on screen, so the script can read it).
"""
from __future__ import annotations

import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import uidrive as ui

ANDROID = Path(__file__).resolve().parents[1] / "android"
LOCALE = "ar-OM"


def strings(module: str) -> dict[str, list[str]]:
    """String resources of a module in both languages, so the flows work whichever locale the device ends up in."""
    out: dict[str, list[str]] = {}
    for folder in ("values-ar", "values"):
        path = ANDROID / module / "src/main/res" / folder / "strings.xml"
        if path.exists():
            for el in ET.parse(path).getroot().iter("string"):
                out.setdefault(el.get("name", ""), []).append((el.text or "").replace("\\'", "'").replace("\\n", "\n"))
    return out


COMMON = strings("android-common")


def rx(table: dict[str, list[str]], key: str) -> str:
    """Regex for a string resource (either language); format arguments match anything. Unknown keys match nothing."""
    values = table.get(key) or COMMON.get(key)
    if not values:
        return f"<missing string {key}>"
    return "|".join(re.sub(r"%\d*\\?\$?[sd]", ".*", re.escape(v).replace("\\%", "%")) for v in values)


def set_system_locale() -> None:
    """Arabic system locale (emulator images allow root): set the property and restart the framework."""
    ui.adb("root")
    time.sleep(4)
    ui.adb("wait-for-device", timeout=120)
    ui.shell(f"setprop persist.sys.locale {LOCALE}; setprop ctl.restart zygote")
    time.sleep(25)
    for _ in range(60):
        if "package:" in ui.shell("pm path android") and ui.shell("getprop sys.boot_completed").strip() == "1":
            break
        time.sleep(3)
    time.sleep(10)
    ui.shell("input keyevent 82")  # dismiss the keyguard if it came back
    print("system locale:", ui.shell("getprop persist.sys.locale").strip(), "|", ui.shell("am get-config").splitlines()[:1])


def prepare(package: str, apk: str) -> None:
    print(ui.adb("install", "-r", "-g", apk, timeout=300).stdout.decode(errors="replace").strip())
    for perm in ("POST_NOTIFICATIONS", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "CAMERA"):
        ui.shell(f"pm grant {package} android.permission.{perm}")
    ui.shell(f"cmd locale set-app-locales {package} --user 0 --locales {LOCALE}")


def launch(package: str) -> None:
    ui.shell(f"am force-stop {package}")
    ui.shell(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
    time.sleep(6)


def wait_for_network() -> None:
    """After the framework restart the emulator needs a moment before it can reach the host again."""
    for _ in range(40):
        if "1 received" in ui.shell("ping -c 1 -W 2 10.0.2.2") or "bytes from" in ui.shell("ping -c 1 -W 2 10.0.2.2"):
            print("   network: host reachable")
            return
        time.sleep(3)
    print("   !! network: host 10.0.2.2 not reachable by ping (continuing)")


def app_log(package: str) -> None:
    """Errors the app logged, to explain a failed screen."""
    pid = ui.shell(f"pidof {package}").strip()
    out = ui.adb("logcat", "-d", "-t", "1500", timeout=60).stdout.decode(errors="replace")
    lines = [ln for ln in out.splitlines() if (pid and f" {pid} " in ln) and re.search(r" [EW] |Exception|exception|Caused by|\tat ", ln)
             and not re.search(r"OpenGLRenderer|FrameTracker|failed to call release", ln)]
    print(f"   logcat ({package}, pid {pid or '?'}): {len(lines)} warning/error lines")
    for ln in lines[-70:]:
        print("     " + ln[:260])


def open_home(first_store: str, retry: str) -> None:
    """Wait for the store list; if the first load failed, use the screen's own retry button."""
    for attempt in range(4):
        try:
            ui.wait_for(first_store, 25)
            return
        except TimeoutError:
            if ui.find(retry) is not None:
                print(f"   home showed an error, tapping retry (attempt {attempt + 1})")
                ui.tap(retry)
    ui.wait_for(first_store, 10)


def tab(label: str) -> None:
    ui.tap(label, lowest=True)


def sign_in(phone: str) -> None:
    ui.tap(rx(COMMON, "auth_phone_label"))
    ui.type_text(phone)
    ui.back()  # hide the keyboard so the button is on screen
    ui.tap(rx(COMMON, "auth_send_code"))
    node = ui.wait_for(r"\b\d{6}\b", 20)
    code = re.search(r"\b(\d{6})\b", (node.get("text") or "") + " " + (node.get("content-desc") or "")).group(1)
    print(f"   dev code on screen: {code}")
    ui.tap(rx(COMMON, "auth_code_label"))
    ui.type_text(code)
    time.sleep(4)  # a complete code is submitted automatically
    if ui.find(rx(COMMON, "auth_verify")) is not None:  # older builds: hide the keyboard and press the button
        ui.back()
        if ui.find(rx(COMMON, "auth_verify")) is not None:
            ui.tap(rx(COMMON, "auth_verify"))
        time.sleep(4)


def consumer(out: str, apk: str) -> ui.Session:
    pkg, S = "om.qabnah.consumer", strings("consumer")
    s = ui.Session(out, "consumer")
    prepare(pkg, apk)
    launch(pkg)
    ok = s.step("home", lambda: open_home("بيت القهوة|مشويات الزعفران|Qahwa House", rx(COMMON, "common_retry")), settle=4)
    if not ok:
        app_log(pkg)
    s.step("home-scrolled", lambda: ui.swipe_up(0.45))
    s.step("storefront", lambda: ui.tap("بيت القهوة|Qahwa House"), settle=5)
    s.step("product", lambda: ui.tap("شاي كرك|Karak Tea"), settle=3)
    s.step("added-to-cart", lambda: ui.tap(f"{rx(S, 'product_add_label')}|{rx(S, 'product_add_to_cart')}"), settle=3)
    s.step("cart-or-checkout", lambda: ui.tap(f"{rx(S, 'cart_view_short')}"), settle=4)
    s.step("sign-in-phone", lambda: ui.wait_for(rx(COMMON, "auth_phone_label"), 10))
    s.step("signed-in", lambda: sign_in("90000001"), settle=5)
    s.step("checkout", lambda: ui.wait_for(rx(S, "checkout_title"), 15), settle=3)
    launch(pkg)
    s.step("home-signed-in", lambda: open_home("بيت القهوة|مشويات الزعفران|Qahwa House", rx(COMMON, "common_retry")), settle=3)
    s.step("orders", lambda: tab(rx(S, "tab_orders")), settle=4)
    s.step("send-parcel", lambda: tab(rx(S, "tab_send")), settle=4)
    s.step("account", lambda: tab(rx(S, "tab_account")), settle=4)
    app_log(pkg)
    return s


def captain(out: str, apk: str) -> ui.Session:
    pkg, S = "om.qabnah.captain", strings("captain")
    s = ui.Session(out, "captain")
    prepare(pkg, apk)
    launch(pkg)
    s.step("welcome", lambda: ui.wait_for(rx(COMMON, "auth_phone_label"), 40))
    s.step("signed-in-home", lambda: sign_in("90001001"), settle=6)
    if ui.find(rx(S, "home_go_online")) is not None:  # the seeded captain is usually online already
        s.step("go-online", lambda: ui.tap(rx(S, "home_go_online")), settle=8)
    s.step("deliveries", lambda: tab(rx(S, "tab_deliveries")), settle=4)
    s.step("earnings", lambda: tab(rx(S, "tab_earnings")), settle=4)
    s.step("profile", lambda: tab(rx(S, "tab_profile")), settle=4)
    app_log(pkg)
    return s


class Tee:
    """Mirror everything printed into a log file that is published next to the screenshots."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.file, self.out = open(path, "w", encoding="utf-8"), sys.stdout

    def write(self, text: str) -> int:
        self.file.write(text)
        self.file.flush()
        return self.out.write(text)

    def flush(self) -> None:
        self.out.flush()


def main() -> int:
    out, consumer_apk, captain_apk = sys.argv[1:4]
    sys.stdout = Tee(Path(out) / "run.log")
    ui.shell("settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0")
    set_system_locale()
    ui.shell("settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0")
    ui.adb("emu", "geo", "fix", "58.4059", "23.5880")  # Muscat (lng lat)
    wait_for_network()
    sessions = [consumer(out, consumer_apk), captain(out, captain_apk)]
    for s in sessions:
        print(f"{s.prefix}: {s.n} screenshots, failed steps: {', '.join(s.failed) or 'none'}")
    return 0  # screenshots are the deliverable; failed steps are listed above and in the job log


if __name__ == "__main__":
    sys.exit(main())
