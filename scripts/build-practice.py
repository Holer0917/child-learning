"""Generate the checked-in browser module; running the website needs no build."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.tmp/style-build-tools'))
try:
    import rjsmin
except ImportError:
    raise SystemExit('Install build-only tool: python -m pip install --target .tmp/style-build-tools rjsmin==1.2.4')
source = root / 'authoring/practice.js'
target = root / 'src/ui/pages/practice.js'
output = '// Generated from authoring/practice.js; run python scripts/build-practice.py.\n' + rjsmin.jsmin(source.read_text(encoding='utf-8')) + '\n'
if '--check' in sys.argv:
    if target.read_text(encoding='utf-8') != output:
        raise SystemExit('Generated practice module differs from its readable source.')
else:
    target.write_text(output, encoding='utf-8', newline='\n')
print('practice source and browser module match')
