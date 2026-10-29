# Registro de Alterações do Projeto

Este arquivo registra o que foi feito em cada etapa do desenvolvimento do app, em linguagem simples e direta.

---

## Preparação Inicial (Seção 0)
- **Prompt base salvo:** Salvo em [docs/PROMPT.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/docs/PROMPT.md) para preservar todas as definições e contexto do projeto.
- **Telas de referência:** Verificados os 4 arquivos HTML e 4 imagens PNG na pasta `docs/referencias/`.
- **Regras do projeto:** Criado o arquivo [GEMINI.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/GEMINI.md) com diretrizes de trabalho e segurança.
- **Registro inicial:** Criado este arquivo [REGISTRO.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/REGISTRO.md).
- **Mapeamento de modelos do seletor:** Atualizada a Seção 12 em [docs/PROMPT.md](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/docs/PROMPT.md) alinhando as etapas exatamente com as opções disponíveis na interface (Gemini 3.8 Flash, Gemini 4 Argon, Claude Sonnet 5.5 e Claude Opus 5.5, com esforços Low, Medium e High).

---

## Etapa 1: Preparação do Ambiente e Estrutura Base
- **Projeto inicializado:** Estruturado com Next.js 15, TypeScript e Tailwind CSS.
- **Identidade visual aplicada:** Configurada a paleta de cores (`#F4F5F9`, `#3B4CCA`, `#E4E6EE` e as cores de orçamento verde, amarelo e vermelho) e a tipografia *Plus Jakarta Sans*.
- **Segurança de credenciais:** Criado o `.gitignore` com proteção estrita para `.env*.local` e criado o arquivo `.env.example` e `.env.local` para futura inserção das chaves do Supabase.
- **Primeiro commit Git:** Repositório local inicializado e primeiro commit registrado com sucesso.
- **GitHub configurado:** Repositório privado `pechincha` criado na conta GitHub (`diogold01`), token salvo com segurança na pasta de projetos e branch `main` enviada com sucesso (`git push`).
- **Servidor em execução:** Aplicação rodando localmente em `http://localhost:3000`.

---

## Etapa 2: Banco de Dados, Login, Grupos e Revisão de Segurança (RLS)
- **Script do Banco ([supabase/schema.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/schema.sql)):** Criadas todas as 12 tabelas do aplicativo (`groups`, `group_members`, `group_invites`, `group_settings`, `sectors`, `markets`, `market_sector_order`, `products`, `prices`, `carts`, `cart_items`, `cart_payments`) com validações de valores positivos e integridade entre grupos.
- **Políticas de Segurança (RLS) e Revisão:** Habilitado `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` nas 12 tabelas. Criada a função segura `is_group_member(group_id)` com `SECURITY DEFINER` e `search_path = public` (evitando recursão infinita) e bloqueada a inserção direta em `groups` e `group_members`, permitindo entrada apenas pelo 1º criador ou via código de convite de uso único (`accept_group_invite`).
- **Conexão Supabase ([src/lib/supabase/client.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/supabase/client.ts), [src/lib/supabase/server.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/supabase/server.ts) e [src/middleware.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/middleware.ts)):** Configurada a sessão automática por cookies usando apenas a chave pública (`ANON_KEY`), sem nunca expor a chave `service_role`.
- **Telas de Login, Convite e Criação de Grupo ([src/app/login/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/login/page.tsx), [src/app/convite/[codigo]/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/convite/%5Bcodigo%5D/page.tsx), [src/components/GroupOnboarding.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/GroupOnboarding.tsx) e atualização de [src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Implementado login por e-mail e senha, bloqueio de cadastro sem convite após o 1º grupo, detecção automática do fuso horário (padrão `America/Cuiaba`), criação automática dos 11 setores padrão e gerador de link/código de convite para enviar no WhatsApp.

---

## Etapa 3: Cadastros de Mercados, Setores, Produtos e Histórico de Preços
- **Formatação e Motor de Preços ([src/lib/format.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/format.ts)):** Criado o cálculo de preço estimado (média dos últimos N meses, último ou menor preço), separação de preços de atacado fora da média de varejo, comparativo "onde está mais barato" entre mercados e comparativo entre marcas.
- **Navegação Principal ([src/components/BottomNav.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/BottomNav.tsx)):** Criada a barra inferior interativa com as 5 abas e integrada à tela inicial ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)).
- **Mercados, Setores e Configurações ([src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx)):** Criada a aba "Mais" com painéis deslizantes (bottom sheets) para cadastrar/editar mercados (com escolha do mercado padrão), editar ou criar setores (com emojis) e ajustar o método e meses da estimativa de preços.
- **Catálogo de Produtos e Histórico de Preços ([src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx)):** Criada a aba "Produtos" com busca por nome/marca, filtro por setor, cadastro de produto com preço inicial opcional, gráfico de evolução de preços, comparativo por mercado e marca, e registro de preços com autocompletar de marca e opção discreta de atacado ("Mais opções (atacado)").
- **Ajuste de UX no campo de Emoji ([src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx) e [src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx)):** Configurado para ocultar o emoji de exemplo assim que o usuário clica no campo (`focus:placeholder-transparent`) e sugerir automaticamente o emoji do setor escolhido.

---

## Etapa 4: Planejamento de Carrinho, Estimativas, Avisos de Orçamento e "Costumo Comprar"
- **Cálculo de Estimativas de Carrinho e Atacado ([src/lib/format.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/format.ts)):** Criada a função `calcularEstimativaItemCarrinho` que calcula o preço estimado considerando os últimos N meses, prioridade de mercado do carrinho, prioridade da marca escolhida, aviso de preço desatualizado e aplicação automática do preço de atacado quando a quantidade atinge o mínimo (exibindo a economia: *"levando X, você economiza R$ Y"*).
- **Componente "Costumo comprar" ([src/components/FrequentProductsBar.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/FrequentProductsBar.tsx)):** Criada a barra de produtos mais frequentes dos últimos 3 meses para adicionar com 1 toque, construída de forma isolada e fácil de remover (`EXIBIR_COSTUMO_COMPRAR`).
- **Tela de Planejamento de Carrinho ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Criada a aba "Compra" com escolha de mercado por carrinho (reestimando os preços automaticamente ao trocar de mercado), busca instantânea com cadastro rápido de produtos inexistentes, agrupamento por setor com subtotais, avisos singelos de estouro de orçamento (*"Esse carrinho estoura [Setor] em R$ X"*), controles rápidos de quantidade (`-`/`+`) e painel para definir quantidade decimal e marca do item.
- **Atalhos na Tela Inicial ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Adicionados os botões "Continuar compra" e "Nova compra" seguindo a referência visual `1-inicio.html`.
