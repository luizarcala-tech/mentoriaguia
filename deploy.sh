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

echo "🧪 Executando suíte (auditoria estrutural + 51 testes de lógica)..."
if ! node tests.js | tail -1 | grep -q "FAIL=0"; then
    echo "❌ TESTES FALHARAM — deploy abortado:"
    node tests.js
    exit 1
fi
echo "✅ Auditoria estrutural + testes de lógica — tudo passou"

echo "📦 Commitando em main..."
# index.html é o entregável, mas tests.js (a suíte que acabou de validar
# o deploy) e supabase_schema.sql precisam ir junto — senão a próxima
# sessão herda uma suíte desatualizada e acha que está tudo coberto
# quando não está. Foi um bug real: 3 deploys seguidos publicaram só
# index.html e deixaram tests.js órfão, sem ninguém perceber.
git add index.html tests.js audit.sh deploy.sh
[ -f supabase_schema.sql ] && git add supabase_schema.sql
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
