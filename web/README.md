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

Banco: num projeto novo, rode `../scripts/migrations/20261014_punches.sql` no SQL
Editor do Supabase e crie o usuário em *Authentication → Users*. Desligue o
cadastro público (*Authentication → Sign In / Providers → Allow new users to sign
up*): o app não tem tela de cadastro. Os outros arquivos da pasta são o histórico
da migração do app antigo e já foram aplicados em produção.

## Variáveis de ambiente

| Nome | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + servidor | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + servidor | chave pública (publishable ou anon); o RLS restringe tudo ao usuário logado |

## Deploy (Vercel)

Projeto com **Root Directory** `web` e as duas variáveis públicas do Supabase.
O `vercel.json` fixa o pnpm 12.8.1 do `packageManager`: como o app fica numa
subpasta, a detecção automática da Vercel não acha o `packageManager`, cai
num pnpm antigo e esse não lê o lockfile do pnpm 12. Ao atualizar o pnpm,
mude a versão nos dois lugares.

## Scripts

- `pnpm check`: lint, typecheck e testes. Rode antes de considerar algo pronto.
- `pnpm test`: vitest (domínio, análise, paridade com o app antigo, importações,
  Excel, backup).
- `pnpm build`: build de produção.
- `pnpm e2e:db`: sobe um Supabase local no Docker (só banco, auth e API REST).
  `pnpm e2e:db:stop` desliga.
- `pnpm e2e`: testes ponta a ponta com Playwright (veja abaixo).

## Testes ponta a ponta

Precisam de Docker. Com o Supabase local de pé (`pnpm e2e:db`), o `pnpm e2e`
aplica o schema de `../scripts/migrations/`, cria um usuário de teste, sobe o
próprio `next dev` na porta 3200 apontando para o Supabase local e roda os
testes em `e2e/`, cada um começando com a conta vazia. A suíte se recusa a rodar
contra um Supabase que não seja local, então nunca grava em produção.

## Organização

- `lib/domain/`: regras puras (pareamento de batidas, semana, previsão, mês,
  remuneração, simulador, análise do período). `parity.test.ts` compara com
  saídas das regras do app antigo em Python, guardadas num fixture congelado.
- `lib/insights.ts`: frases da Análise ("O que os dados dizem").
- `lib/data/`: acesso ao Supabase. Toda leitura e Server Action passa por
  `requireUser()`; o `proxy.ts` só renova a sessão e redireciona.
- `app/actions.ts`: Server Actions (bater ponto, editar batidas, dia, ajustes,
  importação CSV).
- `app/(app)/`: telas Hoje, Semana, Mês, Análise, Registros e Ajustes.
- `lib/report/` + `app/api/export/`: relatório Excel, CSVs do mês e backup
  completo em JSON (Ajustes → Backup).
- `e2e/`: testes Playwright; `supabase/config.toml` configura o Supabase local
  usado por eles.

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
- A Análise usa só dias fechados até ontem, em períodos de meses inteiros que
  nunca começam antes da primeira batida. O saldo de cada mês é o mesmo da tela
  Mês; os valores em R$ usam o valor-hora atual.
