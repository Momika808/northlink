#!/usr/bin/env python3
"""Пересчёт хэшей встроенных скриптов для CSP в index.html.

Запуск после любой правки <script>: python3 csp.py — печатает хэши и
переписывает атрибут content у <meta http-equiv="Content-Security-Policy">.
Хэш считается от текста между <script> и </script> байт в байт.
"""
import base64, hashlib, re, sys

path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
src = open(path, encoding="utf-8").read()
hashes = []
for m in re.finditer(r"<script>(.*?)</script>", src, re.S):
    h = base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode()
    hashes.append(h)
    print("sha256-" + h, f"({len(m.group(1))} симв.)")
meta = re.search(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")', src)
if not meta:
    sys.exit("нет <meta http-equiv=\"Content-Security-Policy\">")
new_src_dir = "script-src " + " ".join("'sha256-%s'" % h for h in hashes)
content = re.sub(r"script-src [^;]*", new_src_dir, meta.group(2))
if content != meta.group(2):
    src = src[: meta.start(2)] + content + src[meta.end(2):]
    open(path, "w", encoding="utf-8").write(src)
    print("meta обновлён")
else:
    print("meta без изменений")
