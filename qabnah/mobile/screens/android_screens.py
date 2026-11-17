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


def strings(module: str) -> dict[str, str]:
    out: dict[str, str] = {}
    path = ANDROID / module / "src/main/res/values-ar/strings.xml"
    if path.exists():
        for el in ET.parse(path).getroot().iter("string"):
            out[el.get("name", "")] = (el.text or "").replace("\\'", "'").replace("\\n", "\n")
    return out


COMMON = strings("android-common")


def rx(table: dict[str, str], key: str) -> str:
    """Regex for a string resource; format arguments match anything. Unknown keys match nothing (the step then fails)."""
    value = table.get(key) or COMMON.get(key)
    if not value:
        return f"<missing string {key}>"
    return re.sub(r"%\d*\\?\$?[sd]", ".*", re.escape(value).replace("\\%", "%"))


def prepare(package: str, apk: str) -> None:
    print(ui.adb("install", "-r", "-g", apk, timeout=300).stdout.decode(errors="replace").strip())
    for perm in ("POST_NOTIFICATIONS", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION", "CAMERA"):
        ui.shell(f"pm grant {package} android.permission.{perm}")
    ui.shell(f"cmd locale set-app-locales {package} --locales {LOCALE}")


def launch(package: str) -> None:
    ui.shell(f"am force-stop {package}")
    ui.shell(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
    time.sleep(6)


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
    ui.back()
    if ui.find(rx(COMMON, "auth_verify")) is not None:
        ui.tap(rx(COMMON, "auth_verify"))
    time.sleep(4)


def consumer(out: str, apk: str) -> ui.Session:
    pkg, S = "om.qabnah.consumer", strings("consumer")
    s = ui.Session(out, "consumer")
    prepare(pkg, apk)
    launch(pkg)
    s.step("home", lambda: ui.wait_for("بيت القهوة|مشويات الزعفران", 40), settle=4)
    s.step("home-scrolled", lambda: ui.swipe_up(0.45))
    s.step("storefront", lambda: ui.tap("بيت القهوة"), settle=5)
    s.step("product", lambda: ui.tap("شاي كرك"), settle=3)
    s.step("added-to-cart", lambda: ui.tap(f"{rx(S, 'product_add')}|{rx(S, 'product_add_label')}"), settle=3)
    s.step("cart-or-checkout", lambda: ui.tap(f"{rx(S, 'cart_view_short')}"), settle=4)
    s.step("sign-in-phone", lambda: ui.wait_for(rx(COMMON, "auth_phone_label"), 10))
    s.step("signed-in", lambda: sign_in("90000001"), settle=5)
    s.step("checkout", lambda: ui.wait_for(rx(S, "checkout_title"), 15), settle=3)
    launch(pkg)
    s.step("orders", lambda: ui.tap(rx(S, "tab_orders")), settle=4)
    s.step("send-parcel", lambda: ui.tap(rx(S, "tab_send")), settle=4)
    s.step("account", lambda: ui.tap(rx(S, "tab_account")), settle=4)
    return s


def captain(out: str, apk: str) -> ui.Session:
    pkg, S = "om.qabnah.captain", strings("captain")
    s = ui.Session(out, "captain")
    prepare(pkg, apk)
    launch(pkg)
    s.step("welcome", lambda: ui.wait_for(rx(COMMON, "auth_phone_label"), 40))
    s.step("signed-in-home", lambda: sign_in("90001001"), settle=6)
    s.step("go-online", lambda: ui.tap(rx(S, "home_offline")), settle=6)
    s.step("deliveries", lambda: ui.tap(rx(S, "tab_deliveries")), settle=4)
    s.step("earnings", lambda: ui.tap(rx(S, "tab_earnings")), settle=4)
    s.step("profile", lambda: ui.tap(rx(S, "tab_profile")), settle=4)
    return s


def main() -> int:
    out, consumer_apk, captain_apk = sys.argv[1:4]
    ui.shell("settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0")
    ui.adb("emu", "geo", "fix", "58.4059", "23.5880")  # Muscat (lng lat)
    sessions = [consumer(out, consumer_apk), captain(out, captain_apk)]
    for s in sessions:
        print(f"{s.prefix}: {s.n} screenshots, failed steps: {', '.join(s.failed) or 'none'}")
    return 0  # screenshots are the deliverable; failed steps are listed above and in the job log


if __name__ == "__main__":
    sys.exit(main())
