# Hours Commander

Dashboard PJ organizado com persistência em Supabase.

## O que tem agora
- Banco Supabase (Postgres) para guardar horários
- Controle da semana atual (quanto trabalhou e quanto falta para 40h)
- Resumo por semana
- Calendário mensal com horas por dia
- Importação de CSV e inserção manual na interface
- Previsão para fechar a semana com base no histórico
- Edição e exclusão de registros passados
- Sessão de dia atual em andamento com previsão dinâmica dos próximos horários
- Recalculo da previsão consolidada da semana a cada novo horário do dia atual

## Estrutura
- `dashboard.py`: app Streamlit
- `hours_app/db.py`: acesso ao Supabase
- `hours_app/services.py`: regras de semana, resumo, previsão e calendário
- `hours_app/time_utils.py`: cálculo de minutos/horários
- `hours_app/constants.py`: constantes e helpers de semana

## Como executar
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run dashboard.py
```

## Login simples (tabela users)
O app usa autenticação própria com tabela `users` no Supabase.

1. Rode o SQL em `scripts/supabase_schema.sql` no SQL Editor do Supabase.
2. Gere o hash da senha com o helper do projeto:

```bash
PYTHONPATH=. python - <<'PY'
from hours_app.db import build_password_hash
print(build_password_hash("SUA_SENHA_FORTE"))
PY
```

3. Insira um usuário no Supabase (troque os valores):

```sql
insert into public.users (login, password_hash, is_active)
values ('admin', 'COLE_O_HASH_AQUI', true);
```

No login do app, use esse `login` e a senha original.

## Resetar o banco
Opção 1 (pela interface):
- No topo do dashboard, seção **Banco** → marque confirmação → **Resetar banco**.

Opção 2 (script):
```bash
python3 scripts/reset_db.py
```

## CSV aceito
Formato base:
```csv
day,start,lunchStart,lunchEnd,end
monday,08:00,12:00,13:00,17:00
```

Também pode usar coluna `date` (YYYY-MM-DD). Se não tiver `date`, o app usa a segunda-feira de referência informada na importação.

## Organizar CSVs antigos (pasta old)
Os arquivos `hours_1_03.csv`, `hours_2_03.csv`... são tratados como semanas de março.

Regra aplicada:
- `_1_03` = primeira semana de março
- `_2_03` = segunda semana de março
- primeiro registro começa em **dia 2**

Gerar CSVs prontos para importar (com coluna `date`):
```bash
python3 scripts/prepare_old_csvs.py
```

Saída:
- `old/ready_import/hours_1_03_2026.csv`
- `old/ready_import/hours_2_03_2026.csv`
- `old/ready_import/hours_3_03_2026.csv`
- `old/ready_import/hours_4_03_2026.csv`
