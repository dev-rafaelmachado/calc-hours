# Hours Commander (web)

Controle de jornada por **batidas** (punches): cada dia é uma lista de entradas e
saídas, somadas em pares, com quantas pausas forem necessárias. Next.js 16
(App Router, Cache Components) + shadcn/ui + Supabase.

## Rodando localmente

```bash
cd web
cp .env.example .env.local   # preencha URL e chave pública do Supabase
pnpm install
pnpm dev
```

Banco: rode no SQL Editor do Supabase, em ordem, os arquivos de
`../scripts/migrations/` a partir de `20261014_punches.sql`. Para trazer os dados
do app antigo, crie o usuário em *Authentication → Users*, ajuste o e-mail em
`20261014_migrate_legacy.sql` e rode-o; `20261014_check_legacy_parity.sql` deve
voltar vazio.

## Variáveis de ambiente

| Nome | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + servidor | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + servidor | chave pública (publishable ou anon); o RLS restringe tudo ao usuário logado |

## Scripts

- `pnpm check`: lint, typecheck e testes. Rode antes de considerar algo pronto.
- `pnpm test`: vitest (domínio, paridade com o app Python, importação CSV, Excel).
- `pnpm build`: build de produção.

## Organização

- `lib/domain/`: regras puras (pareamento de batidas, semana, previsão, mês,
  remuneração, simulador). `parity.test.ts` compara com saídas do
  `hours_app/services.py` geradas por `../scripts/gen_parity_fixtures.py`.
- `lib/data/`: acesso ao Supabase. Toda leitura e Server Action passa por
  `requireUser()`; o `proxy.ts` só renova a sessão e redireciona.
- `app/actions.ts`: Server Actions (bater ponto, editar batidas, dia, ajustes,
  importação CSV).
- `app/(app)/`: telas Hoje, Semana, Mês, Registros e Ajustes.
- `lib/report/` + `app/api/export/`: relatório Excel e CSVs do mês.

## Regras que valem saber

- Número ímpar de batidas hoje = intervalo aberto até agora. Num dia passado =
  "incompleto": só os pares fechados contam.
- Feriado zera a meta do dia e as horas dele não contam.
- A compensação que o plano da semana tenta repor é o saldo do mês até a
  véspera da semana: meta dos dias úteis desde o dia 1º menos o trabalhado. Hora
  extra abate falta, dia útil sem batida conta como falta e o saldo zera na
  virada do mês.
- Na tela Mês, semanas que cruzam a virada contam só os dias daquele mês.
- O plano não tem teto diário: se faltar muito, a saída prevista pode passar da
  meia-noite (aparece "+1 dia").
