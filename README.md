# Hours Commander

Controle pessoal de jornada por batidas: quantas entradas e saídas o dia tiver,
meta da semana e do mês, importação da Sólides, análise das horas e relatórios.
Next.js + Supabase, publicado na Vercel.

O app fica em [`web/`](web/README.md), com instruções para rodar, variáveis de
ambiente, deploy, testes e as regras de cálculo.

`scripts/migrations/` guarda, em ordem de data, o SQL aplicado no Supabase de
produção. Num banco novo basta `20261014_punches.sql`; os outros arquivos são o
histórico da migração e da remoção do app antigo em Streamlit, que está no
histórico do git.
