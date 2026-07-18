#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# audit.sh — Rotina de auditoria da Arcala Insight
#
# O que faz:
#   1. Clona/atualiza o repo
#   2. Valida sintaxe do index.html
#   3. Roda a suíte completa (auditoria estrutural + testes de lógica)
#   4. Se tudo passar, reporta pronto para deploy
#   5. Se algo falhar, para e mostra exatamente o que quebrou — não
#      corrige sozinho, porque corrigir sem entender o motivo é como
#      os bugs #7 e #8 do histórico aconteceram.
#
# Uso:
#   ./audit.sh              → só audita, não faz deploy
#   ./audit.sh --deploy "mensagem"   → audita e, se passar, faz deploy
#
# Pensado para ser chamado por um agente (Claude Code, cron, CI) sem
# supervisão humana linha a linha — por isso os códigos de saída são
# a única coisa que importa: 0 = tudo verde, 1 = há problema real.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# O token de push nunca fica hardcoded aqui — GitHub bloqueia (corretamente)
# qualquer commit que contenha um PAT em texto puro. Defina antes de rodar:
#   export GH_TOKEN="ghp_xxx"
# Se não definido, o script clona/atualiza em modo leitura (sem credencial),
# o que é suficiente para auditar; só falha se precisar dar push.
GH_TOKEN="${GH_TOKEN:-}"
if [ -n "$GH_TOKEN" ]; then
  REPO_URL="https://luizarcala-tech:${GH_TOKEN}@github.com/luizarcala-tech/mentoriaguia.git"
else
  REPO_URL="https://github.com/luizarcala-tech/mentoriaguia.git"
fi
WORKDIR="${AUDIT_WORKDIR:-/home/claude/mentoria-platform}"

echo "════════════════════════════════════════════════════"
echo " ARCALA INSIGHT — Auditoria de Plataforma"
echo " $(date -u +'%Y-%m-%d %H:%M UTC')"
echo "════════════════════════════════════════════════════"

# ── 1. Repo ───────────────────────────────────────────────────────
if [ -d "$WORKDIR/.git" ]; then
  cd "$WORKDIR"
  git config user.email "luizarcala@outlook.com" >/dev/null
  git config user.name "luizarcala-tech" >/dev/null
  git pull origin main -q
else
  git clone -q "$REPO_URL" "$WORKDIR"
  cd "$WORKDIR"
  git config user.email "luizarcala@outlook.com" >/dev/null
  git config user.name "luizarcala-tech" >/dev/null
fi
echo "→ repo em $(git rev-parse --short HEAD)"

# ── 2. Sintaxe ────────────────────────────────────────────────────
echo ""
echo "── Validando sintaxe do index.html ──"
python3 -c "
import re, sys
s = open('index.html', encoding='utf-8').read()
blocks = re.findall(r'<script>(.*?)</script>', s, re.S)
if not blocks:
    print('ERRO: nenhum bloco <script> encontrado'); sys.exit(1)
open('/tmp/_audit_check.js', 'w', encoding='utf-8').write(max(blocks, key=len))
"
if node --check /tmp/_audit_check.js 2>/tmp/_audit_syntax_err.txt; then
  echo "✅ sintaxe OK"
else
  echo "❌ ERRO DE SINTAXE:"
  cat /tmp/_audit_syntax_err.txt
  echo ""
  echo "AUDITORIA INTERROMPIDA — corrija a sintaxe antes de rodar os testes."
  exit 1
fi

# ── 3. Suíte de testes ────────────────────────────────────────────
echo ""
echo "── Rodando suíte de testes (estrutural + lógica) ──"
if node tests.js > /tmp/_audit_test_output.txt 2>&1; then
  TEST_EXIT=0
else
  TEST_EXIT=1
fi
cat /tmp/_audit_test_output.txt

RESULT_LINE=$(grep "RESULTADO FINAL" /tmp/_audit_test_output.txt || echo "")
FAIL_COUNT=$(echo "$RESULT_LINE" | grep -oE "FAIL=[0-9]+" | grep -oE "[0-9]+" || echo "1")

echo ""
if [ "$TEST_EXIT" -eq 0 ] && [ "${FAIL_COUNT:-1}" -eq 0 ]; then
  echo "✅ AUDITORIA COMPLETA: tudo verde."
else
  echo "❌ AUDITORIA ENCONTROU PROBLEMAS."
  echo ""
  echo "Falhas específicas:"
  grep "❌" /tmp/_audit_test_output.txt || true
  echo ""
  echo "Regra de ouro: escreva um teste que reproduza o bug exato,"
  echo "prove que falha com o código antigo, só então corrija."
  echo "Não pule para o deploy com testes falhando."
  exit 1
fi

# ── 4. Deploy opcional ────────────────────────────────────────────
if [ "${1:-}" = "--deploy" ]; then
  MSG="${2:-auditoria automática — sem alterações de código}"
  if [ -z "$GH_TOKEN" ] && ! git remote get-url origin 2>/dev/null | grep -q '@'; then
    echo ""
    echo "⚠ --deploy pedido mas GH_TOKEN não está definido e o remote não"
    echo "  tem credencial embutida. O push provavelmente vai falhar."
    echo "  Rode: export GH_TOKEN=\"ghp_...\" antes de chamar este script."
  fi
  echo ""
  echo "── Deploy solicitado ──"
  ./deploy.sh "$MSG"
else
  echo ""
  echo "(rode com --deploy \"mensagem\" para publicar se tudo passou)"
fi
