# Real-device screenshots

`android_screens.py` installs the debug APKs on an emulator, drives them against the real backend (Docker stack with
sample data) and saves screenshots. The GitHub workflow `qabnah-mobile-screens.yml` runs it and commits the pictures to
`docs/screenshots/mobile/android/`. Steps are best-effort; the job log lists what was on screen after every step and
which steps failed.

Local run (emulator booted, `docker compose up` in `infra/` with `MERCHANT_WEB_URL=http://10.0.2.2:5173`):

    python3 android_screens.py /tmp/shots ../android/consumer/build/outputs/apk/debug/consumer-debug.apk \
        ../android/captain/build/outputs/apk/debug/captain-debug.apk
