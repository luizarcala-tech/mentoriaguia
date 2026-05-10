#!/bin/bash
# ══════════════════════════════════════════════
# ARCALA INSIGHT — Deploy seguro
# Uso: ./deploy.sh "mensagem do commit"
# ══════════════════════════════════════════════

set -e  # Para em qualquer erro

MSG="${1:-update}"
FILE="index.html"

echo "🔍 Verificando sintaxe JavaScript..."
python3 -c "
import re, subprocess
with open('$FILE') as f: c=f.read()
scripts = re.findall(r'<script>(.*?)</script>', c, re.DOTALL)
js = '\n'.join(scripts)
with open('/tmp/_check.js','w') as f: f.write(js)
r = subprocess.run(['node','--check','/tmp/_check.js'], capture_output=True, text=True)
if r.returncode != 0:
    print('❌ ERRO DE SINTAXE:')
    print(r.stdout[:400])
    exit(1)
print('✅ JavaScript válido')

# Check critical functions
critical = ['doLogin','bootApp','checkSession','hashPassword','sbPatchUser',
            'loadAllUsers','renderSidebar','showPage','toast','initials']
missing = [fn for fn in critical if f'function {fn}' not in c and f'async function {fn}' not in c]
if missing:
    print('❌ FUNÇÕES CRÍTICAS AUSENTES:', missing)
    exit(1)
print('✅ Funções críticas presentes')
"

echo "📦 Commitando em main..."
git add index.html
git commit -m "$MSG"
git push origin main

echo "🏷️  Atualizando branch stable..."
git checkout stable
git merge main --no-edit
git push origin stable
git checkout main

echo ""
echo "✅ Deploy concluído!"
echo "   main:   $(git rev-parse --short HEAD)"
echo "   stable: $(git rev-parse --short origin/stable)"
echo "   URL:    https://luizarcala-tech.github.io/mentoriaguia"
