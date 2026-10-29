# Regras do Projeto — Pechincha

> **IMPORTANTE:** Leia [docs/PROMPT.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/docs/PROMPT.md) antes de qualquer tarefa. Ele contém o plano completo, arquitetura e decisões de negócio já tomadas.

---

## 1. Diretrizes de Trabalho e Comunicação (Resumo da Seção 1)
- **Comunicação simples:** O usuário não programa nem publicou na Vercel; explique tudo em português simples, passo a passo, sem jargões.
- **Uma etapa por vez:** Siga a ordem da Seção 12 do PROMPT.md. Crie sempre arquivos completos e funcionais (nunca incompletos ou com "o resto continua igual").
- **Finalização de etapa:** Ao concluir uma etapa, pare, deixe o app rodando quando aplicável, escreva no máximo 1 parágrafo de resumo e aguarde o usuário dizer "continue".
- **Registro:** Atualize o [REGISTRO.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/REGISTRO.md) a cada etapa com o que foi feito em linguagem simples.
- **Estabilidade de arquivos:** Não reescreva arquivos já concluídos, a não ser que estritamente indispensável (explicando o motivo antes).
- **Lembrete de modelo:** No início de cada etapa, lembre o usuário do modelo e do nível de esforço recomendados.
- **Transparência de comandos:** Antes de rodar comandos que instalem pacotes, apaguem arquivos ou alterem configurações, explique em uma frase o que ele faz.
- **Padrão brasileiro:** Interface, mensagens e código comentados em português do Brasil. Valores em R$ (BRL), datas em dd/mm/aaaa e vírgula como separador decimal.
- **Decisões simples:** Se algo não estiver especificado, adote a alternativa mais simples e avise em uma frase.

---

## 2. Segurança e Qualidade Técnica (Resumo da Seção 11)
- **RLS obrigatório:** Row Level Security (RLS) habilitado em todas as tabelas no Supabase (segurança por `group_id`). Jamais expor a chave `service_role` no front-end.
- **Proteção de credenciais:** Variáveis sensíveis ficam em `.env.local` (e na Vercel). Sempre certifique-se de que `.env.local` está listado no `.gitignore` antes de qualquer push ao GitHub.
- **Sem senhas no chat:** Nunca peça para o usuário colar credenciais no chat; indique o arquivo e linha/campo onde ele deve inserir.
- **Validação e erros:** Validações consistentes (valores e quantidades positivas) e tratamento de erros com mensagens claras em português.
- **Código limpo:** Dependências enxutas, boa modularização e foco na experiência mobile rápida e responsiva.
