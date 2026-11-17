import os, re, sys
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out = sys.argv[1]
mods = {'android-common': 'om.qabnah.android', 'consumer': 'om.qabnah.consumer', 'captain': 'om.qabnah.captain'}
for mod, pkg in mods.items():
    res = f'{root}/{mod}/src/main/res'
    strings = re.findall(r'<string name="(\w+)"', open(f'{res}/values/strings.xml').read())
    drawables = [f[:-4] for f in os.listdir(f'{res}/drawable')] if os.path.isdir(f'{res}/drawable') else []
    lines = [f'package {pkg}', '', 'object R {', '    object string {']
    lines += [f'        const val {n} = {i + 1}' for i, n in enumerate(strings)]
    lines += ['    }', '    object drawable {']
    lines += [f'        const val {n} = {i + 10000}' for i, n in enumerate(drawables)]
    fonts = [f.rsplit('.', 1)[0] for f in os.listdir(f'{res}/font')] if os.path.isdir(f'{res}/font') else []
    bad = [n for n in drawables + fonts if not re.fullmatch(r'[a-z][a-z0-9_]*', n)]
    if bad:
        sys.exit(f'invalid resource file names in {mod}: {bad}')
    lines += ['    }', '    object font {']
    lines += [f'        const val {n} = {i + 20000}' for i, n in enumerate(fonts)]
    lines += ['    }', '}']
    if mod != 'android-common':
        lines += ['', 'object BuildConfig {', '    const val DEBUG = true', '    const val API_BASE_URL = "http://10.0.2.2:4000/v1"',
                  '    const val VERSION_NAME = "1.0.0"', f'    const val APPLICATION_ID = "{pkg}"',
                  '    val FCM_PROJECT_ID = ""', '    val FCM_APP_ID = ""', '    val FCM_API_KEY = ""', '    val FCM_SENDER_ID = ""', '}']
    os.makedirs(out, exist_ok=True)
    open(f'{out}/{mod}_R.kt', 'w').write('\n'.join(lines) + '\n')
print('generated')
