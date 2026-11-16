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
    lines += ['    }', '}']
    if mod != 'android-common':
        lines += ['', 'object BuildConfig {', '    const val DEBUG = true', '    const val API_BASE_URL = "http://10.0.2.2:4000/v1"',
                  '    const val VERSION_NAME = "1.0.0"', f'    const val APPLICATION_ID = "{pkg}"', '}']
    os.makedirs(out, exist_ok=True)
    open(f'{out}/{mod}_R.kt', 'w').write('\n'.join(lines) + '\n')
print('generated')
