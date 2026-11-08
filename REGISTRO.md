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

---

## Etapa 5: Modo Mercado ao Vivo, Teclado de Preço, Corredores Arrastáveis e Finalização
- **Modo Mercado ao Vivo ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Criada a tela de compras no mercado seguindo fielmente as referências visuais `2-modo-mercado.html` e `3-preco-do-item.html`, com topo fixo exibindo o total real dos itens pegos em destaque, o total estimado do carrinho completo ao lado e barra de progresso de itens marcados.
- **Reordenação de Corredores por Mercado (`market_sector_order`):** Adicionado suporte para segurar/arrastar ou mover setores para cima e para baixo, salvando automaticamente a ordem dos corredores para o mercado selecionado e mantendo espaço extra no fim da lista (`pb-44`) para o botão flutuante `+` nunca cobrir o último item.
- **Teclado Numérico de Preço e Pílulas de Marca (`3-preco-do-item.html`):** Implementado o painel deslizante que abre ao tocar no preço do item, com teclado numérico grande 3x4 para uma mão só, chip discreto de comparação com a média histórica (*"Média de N meses: R$ X · ▲/▼ Y%"*), pílulas de marcas conhecidas com 44px de altura, ajuste rápido de quantidade e opção discreta de atacado.
- **Finalização de Compra e Pagamento Misto (`cart_payments`):** Implementado o fechamento da compra gravando automaticamente os preços reais no histórico sem duplicar registros (`cart_item_id` único), opção de manter itens não pegos para uma próxima lista e suporte opcional para dividir o pagamento entre múltiplas formas (ex: Vale-alimentação + Pix).

---

## Etapa 6: Aba Orçamento por Setor, Barras Coloridas e Card do Mês no Início
- **Tela de Orçamento ([src/app/orcamento/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/orcamento/page.tsx)):** Criada a aba "Orçamento" seguindo fielmente a referência visual `4-orcamento.html`, exibindo o gasto total do mês vigente (no fuso horário do grupo), o orçamento total somado, barras de progresso e percentuais com as cores reservadas exclusivamente ao orçamento: verde (`#1F9D57` até 80%), amarelo (`#E8A200` de 80% a 100%) e vermelho (`#D64545` acima de 100%).
- **Criação e Edição de Setores na Aba Orçamento ([src/app/orcamento/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/orcamento/page.tsx)):** Adicionado o botão `+ Setor` no topo e o painel deslizante (bottom sheet) que abre ao tocar em qualquer setor para definir ou alterar o teto mensal em R$ (com atalhos rápidos), editar nome/emoji ou excluir o setor, mostrando o aviso *"defina um valor"* nos setores que ainda não têm orçamento definido.
- **Card do Mês na Tela Inicial ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Substituído o cartão provisório da Etapa 2 pelo Card do Mês definitivo no topo da tela `Início` conforme `1-inicio.html`, exibindo o gasto acumulado do mês, barra de progresso colorida e pílulas de alerta para os setores acima de 80% ou 100% do limite.

---

## Etapa 7: Histórico de Carrinhos, Copiar Carrinho ("Repetir") e Sincronização ao Vivo (Realtime)
- **Função de Copiar Carrinho com Preços Reestimados ([src/lib/cart-actions.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cart-actions.ts)):** Criada a função `repetirCarrinhoNoBanco` que duplica qualquer compra antiga para um novo carrinho planejado, mantendo os produtos, quantidades e marcas, mas recalculando automaticamente os preços estimados e regras de atacado com base no histórico mais recente.
- **Tela de Histórico de Carrinhos ([src/app/historico/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/historico/page.tsx)) e Atalho na Aba Mais ([src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx)):** Criada a página de histórico completo exibindo data, mercado, total gasto, divisão por setores, formas de pagamento, lista expandida de itens e botão **"Repetir"** com 1 toque.
- **Últimos Carrinhos na Tela Inicial ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Adicionada a lista dos últimos carrinhos finalizados com botão **"Repetir"** e barra de progresso no card de compra em andamento, completando 100% da referência `1-inicio.html`.
- **Sincronização ao Vivo a Dois via Supabase Realtime ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx), [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx) e [src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Ativada a escuta em tempo real nas tabelas `carts`, `cart_items` e `market_sector_order` para que qualquer item adicionado, marcado, removido ou com preço alterado por uma pessoa apareça instantaneamente no celular da outra pessoa (valendo a última alteração por item e exibindo o indicador **"Ao vivo"**).

---

## Etapa 8: PWA Instalável, Modo Offline Resiliente no Mercado, Exportação CSV e GitHub Actions
- **PWA Completo ([src/app/manifest.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/manifest.ts), [src/app/icon.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/icon.tsx), [src/app/apple-icon.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/apple-icon.tsx), [public/icon.svg](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/public/icon.svg), [public/sw.js](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/public/sw.js) e [src/components/PwaRegistrar.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/PwaRegistrar.tsx)):** Configurado o manifesto web, ícones de aplicativo para Android e iPhone e Service Worker para abertura rápida e instalação na tela de início.
- **Modo Offline Resiliente no Mercado ([src/lib/offline-sync.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/offline-sync.ts), [src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx) e [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Implementado o armazenamento automático em `IndexedDB` e `localStorage` do carrinho ativo e uma fila de alterações offline que salva marcações, preços, quantidades e remoções no aparelho quando o sinal do mercado cai, sincronizando tudo sozinho assim que a internet volta e mostrando o indicador **"Offline / Sincronizando"**.
- **Exportação CSV, Backup Completo e Guia de Instalação ([src/app/exportar/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/exportar/page.tsx) e [src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx)):** Criada a tela de exportação com planilha CSV das compras finalizadas por setor (com data, mercado, setor, total e formas de pagamento para importar no app de finanças), backup completo em CSV/JSON de todas as tabelas e passo a passo ilustrado para instalar o app no Android (Chrome) e no iPhone (Safari).
- **Automação Diária para Manter o Supabase Ativo ([vercel.json](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/vercel.json), [docs/keep-supabase-alive.yml](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/docs/keep-supabase-alive.yml) e [src/app/api/keep-alive/route.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/api/keep-alive/route.ts)):** Configurada a rotina automática diária (às 09:15 UTC) que chama a rota `/api/keep-alive` e faz uma consulta simples ao banco para evitar a pausa automática de 7 dias do plano gratuito do Supabase.

---

## Melhorias de Produção — Etapa 1: Viewport Mobile e Fim do Overflow Horizontal
- **Backup de segurança:** Criado branch de segurança `backup-pre-melhorias` no Git preservando todo o estado pré-modificações.
- **Configuração de Viewport ([src/app/layout.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/layout.tsx)):** Adicionado `viewportFit: "cover"` nas configurações de viewport para garantir adaptação perfeita à tela inteira em todos os modelos de celular.
- **Trava global de layout ([src/app/globals.css](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/globals.css)):** Adicionada proteção estrita com `overflow-x: hidden`, `max-width: 100%` e utilitário `.no-scrollbar` para carrosséis, impedindo qualquer rolagem lateral indesejada do app.
- **Correção da tela de compra ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Aplicadas travas flexíveis `min-w-0 flex-1` e `truncate` no cabeçalho e nos seletores de carrinhos, eliminando os cortes de texto ("mento de Compra" e "pra da semana").
- **Carrossel "Costumo Comprar" ([src/components/FrequentProductsBar.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/FrequentProductsBar.tsx)):** Confinado o container horizontal para não extrapolar a largura pai na tela de planejamento.
- **Modo Mercado ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Aplicadas contenções de largura para garantir estabilidade visual durante as compras ao vivo.

---

## Melhorias de Produção — Etapa 2: Resolução de Sobreposição e Conflito de Teclados
- **Isolamento de teclados no modal de preço ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Substituído o campo inline de marca por um sub-modal dedicado e limpo (`z-[60]`) com suporte a Enter e fechamento automático do teclado nativo. Isso eliminou 100% da sobreposição entre o teclado do celular e o teclado numérico customizado 3x4 e o botão "Salvar preço".
- **Altura dinâmica em gavetas e modais ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx) e [src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Atualizada a altura máxima de todos os modais para `max-h-[90dvh]` com rolagem interna suave (`overscroll-contain`), garantindo que o teclado virtual do celular nunca empurre os botões para fora da tela.
- **Gaveta de adicionar produto rápido ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Fixado o campo de busca no topo e estruturada a lista de sugestões com o botão "+ Cadastrar novo produto" em container rolável independente, permitindo clicar e rolar facilmente com o teclado aberto.
- **Sugestões de busca na tela de compra ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Limitada a altura do dropdown de busca para `max-h-72` com rolagem interna, mantendo a opção de cadastrar novo produto sempre acessível na tela do celular.

---

## Melhorias de Produção — Etapa 3: Inclusão de Marca no Cadastro Rápido (Modo Mercado e Compra)
- **Campo de marca no cadastro rápido ao vivo ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Adicionado o campo "Marca ou sabor (opcional)" no formulário de criação rápida de produto no mercado, permitindo já registrar o item com sua marca em um único passo.
- **Histórico de preços imediato ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Ao preencher o preço na prateleira durante o cadastro rápido, o valor agora é gravado imediatamente no histórico da tabela `prices` vinculado ao mercado ativo e com a marca informada.
- **Campo de marca no cadastro rápido de planejamento ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Incluído o campo "Marca ou sabor (opcional)" na gaveta de criação rápida que abre pela busca de produtos, repassando o vínculo diretamente ao item do carrinho e à tabela `prices`.

---

## Melhorias de Produção — Etapa 4: Agrupamento vs. Separação de Mesmo Produto
- **Prompt de decisão ao adicionar produto existente ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx) e [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Quando o usuário toca para adicionar um produto que já está na compra, o app agora exibe uma gaveta perguntando se deseja **Agrupar** ou **Separar em nova linha**.
- **Regra segura de Agrupamento:** Ao escolher "Agrupar", o sistema preserva estritamente o preço que já estava registrado naquela linha e apenas soma `+1` na quantidade.
- **Variações independentes na mesma compra:** Ao escolher "Separar", é criada uma nova linha independente em `cart_items` para o mesmo produto base, permitindo informar outra marca/sabor e outro preço (ex.: diferentes sabores de suco em pó com preços distintos na mesma compra).

---

## Melhorias de Produção — Etapa 5: Prevenção de Duplicações na Edição e Fila Offline
- **Botão "Renomear produto" nas gavetas de item ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx) e [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Adicionado botão direto no cabeçalho de edição do item (tanto no Planejamento quanto no Modo Mercado ao Vivo) para corrigir o nome e a unidade do produto (ex.: de "Refrigerante" para "Refrigerante 2L") via `UPDATE` estrito em `products`, sem criar cadastros ou linhas duplicadas.
- **Blindagem contra duplicação na edição e cadastro rápido ([src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx), [src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx) e [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Caso o usuário tente cadastrar um produto cujo nome já exista no catálogo, o sistema atualiza o registro existente (`UPDATE`) em vez de duplicá-lo, além de deduplicar eventos simultâneos do Realtime ao adicionar itens ao carrinho.
- **Resolução de IDs temporários e histórico sem duplicatas ([src/lib/offline-sync.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/offline-sync.ts) e [src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** Implementado mapeamento automático de IDs temporários (`temp-xxx`) para os UUIDs reais do banco tanto na memória quanto no processamento da fila offline, e atualização (`upsert` por `cart_item_id`) imediata na tabela `prices` ao salvar preço ou marca no Modo Mercado.

---

## Design Responsivo — Etapa 1: Casca Global e Sidebar para Desktop
- **Nova Sidebar para Desktop ([src/components/Sidebar.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/Sidebar.tsx)):** Criada a barra de navegação lateral fixa (`w-64`) para computadores e tablets com logo Pechincha, itens de menu com ícones e destaques visuais ativos, e atalhos rápidos para Histórico e Exportação de dados.
- **Navegação Móvel Preservada ([src/components/BottomNav.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/BottomNav.tsx)):** A barra inferior mobile continua 100% preservada em telas de celular (`md:hidden`), enquanto em telas maiores (`md:flex`) exibe a Sidebar automaticamente.
- **Classes Responsivas Globais ([src/app/globals.css](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/globals.css)):** Adicionados utilitários para centralização e flutuação de modais em telas médias/grandes, evitando que fiquem colados no rodapé como gavetas em monitores grandes.
- **Alinhamento dos Containers das Páginas ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx), [src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx), [src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx), [src/app/orcamento/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/orcamento/page.tsx), [src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx), [src/app/historico/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/historico/page.tsx), [src/app/exportar/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/exportar/page.tsx)):** Adicionado o espaçamento lateral `md:pl-64` e limites responsivos amplos (`md:max-w-4xl lg:max-w-6xl`) para preparar a expansão do conteúdo em telas grandes.

---

## Design Responsivo — Etapa 2: Tela Início em 2 Colunas (Dashboard Desktop)
- **Grid de 2 Colunas no Computador ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Estruturada a tela inicial com grade responsiva (`grid-cols-1 lg:grid-cols-12`). Na coluna da esquerda (`lg:col-span-7`), ficam o Card do Mês (gasto × orçamento e alertas), o Card de Continuar Compra e o botão de Nova Compra. Na coluna da direita (`lg:col-span-5`), ficam os Últimos Carrinhos (com repetição rápida) e o Card de Gestão do Grupo e Convites.
- **Preservação Mobile:** No celular (`< lg`), os blocos mantêm o fluxo vertical idêntico à referência original `1-inicio.html`.

---

## Design Responsivo — Etapa 3: Tela de Produtos e Histórico em Grid Responsivo
- **Grid de Produtos Adaptativo ([src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx)):** A lista de produtos agora se expande em grade de 2 a 3 colunas no computador e tablet (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), preenchendo a tela com cartões confortáveis e bem distribuídos.
- **Modais Centralizados no Desktop ([src/app/produtos/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/produtos/page.tsx)):** As gavetas de detalhes do produto, histórico de preços, cadastro rápido e edição agora abrem como caixas de diálogo centralizadas (`md:items-center md:rounded-2xl md:max-w-2xl`) no computador em vez de ficarem presas ao rodapé da tela.

---

## Design Responsivo — Etapa 4: Orçamento, Histórico, Mais e Exportação
- **Orçamento em Grade de 2 Colunas ([src/app/orcamento/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/orcamento/page.tsx)):** Os cartões de setores e barras de progresso do teto de gastos foram organizados em grade responsiva de 2 colunas (`grid-cols-1 md:grid-cols-2`), permitindo visualizar todos os setores sem rolagem excessiva.
- **Histórico de Compras Expandido ([src/app/historico/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/historico/page.tsx)):** As compras finalizadas agora são dispostas em grade de 2 colunas no desktop, com detalhes e totais fáceis de inspecionar e repetir.
- **Tela "Mais" em 2 Colunas ([src/app/mais/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/page.tsx)):** Mercados e Setores distribuídos na coluna esquerda; Configurações e Atalhos na coluna direita.
- **Exportação e Backup em 2 Colunas ([src/app/exportar/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/exportar/page.tsx)):** Opções de exportação CSV e backup completo à esquerda; Guia de Instalação PWA à direita.
- **Modais Centralizados no Desktop:** Todos os modais de cadastro de setor, mercado e estimativa convertidos em caixas de diálogo flutuantes no desktop.

---

## Design Responsivo — Etapa 5: Planejamento de Compra e Modo Mercado Adaptativo
- **Planejamento de Compras em 2 Colunas ([src/app/compra/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/compra/page.tsx)):** Em telas grandes (`lg:`), a lista de itens, carrossel de frequentes e busca instantânea ficam na coluna esquerda (7 colunas), enquanto o card de estimativa geral, seletor de mercado, alertas de orçamento e botão de iniciar compra ficam fixos e visíveis na coluna direita (5 colunas sticky). No celular, a ordem vertical natural continua idêntica e perfeita.
- **Modo Mercado Amplo para Tablets e Computadores ([src/components/LiveMarketMode.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/LiveMarketMode.tsx)):** O Modo Mercado agora expande de forma equilibrada até `md:max-w-2xl lg:max-w-3xl`, centralizado na tela, com topo fixo, lista de itens e rodapé alinhados.
- **Modais Centrais em Toda a Compra:** Modais de preço do item (3x4), troca de mercado, cadastro rápido, conflito de agrupar/separar e pagamento misto convertidos em caixas de diálogo centralizadas (`md:items-center md:rounded-2xl md:max-w-lg`) no computador.

---

## Cadastro Livre e Convites Pós-Criação
- **Liberação do Cadastro Direto ([src/app/login/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/login/page.tsx)):** Removida a exigência obrigatória de código de convite e a mensagem de bloqueio na tela de criação de conta. Qualquer usuário pode criar sua conta livremente preenchendo apenas Nome, E-mail e Senha.
- **Fluxo de Família e Convites Preservado:** Caso alguém acesse por um link de convite (`/convite/[codigo]`), o código é processado automaticamente e a pessoa entra no grupo convidado. Caso contrário, após criar a conta, o usuário cria o grupo da família ("Nossa Casa") e gera convites para parceiro(a) diretamente pelo botão "Convidar segunda pessoa para o grupo" dentro do app.

---

## Acesso Direto para Recrutadores e Edição do Nome do Grupo
- **Entrada Direta sem Tela de Bloqueio ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx) e [src/app/login/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/login/page.tsx)):** Eliminada a obrigatoriedade da tela de "Configurar seu Grupo" (`GroupOnboarding`). Ao logar ou criar conta, o app vincula o novo usuário automaticamente ao grupo existente em segundo plano, caindo direto na tela inicial com todos os recursos, produtos e compras ativos.
- **Renomear Grupo na Interface ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Adicionado botão de lápis no card do grupo na Home, permitindo que o usuário altere o nome do grupo a qualquer momento (ex.: "casal", "Nossa Casa") diretamente de dentro do app.
- **Atualização das Funções do Banco ([supabase/schema.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/schema.sql) e [supabase/migrations/20261107_ensure_user_group.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/migrations/20261107_ensure_user_group.sql)):** Removida a trava de grupo único (`v_any_group_exists`) e criada a função `ensure_user_group` para permitir criação e acesso ilimitado de novos usuários sem mensagens vermelhas.

---

## Acesso como Visitante (Modo Demonstração com 1 Clique)
- **Botão "Entrar como visitante" ([src/app/login/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/login/page.tsx)):** Adicionado botão de acesso rápido na tela de login permitindo que recrutadores e visitantes acessem o aplicativo instantaneamente sem precisar digitar e-mail e senha.
- **Isolamento Estrito de Grupos ([supabase/schema.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/schema.sql) e [supabase/migrations/20261107_fix_guest_isolation.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/migrations/20261107_fix_guest_isolation.sql)):** Corrigida a função `ensure_user_group` para que o visitante acerte exclusivamente o grupo isolado "Demonstração (Visitante)" e nunca acesse o grupo privado da família ("Nossa Casa"). Novos cadastros ganham seu próprio grupo e só entram em outros mediante código de convite explícito.
- **Remoção de Membros pelo Administrador ([src/app/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/page.tsx)):** Adicionado botão `X` ao lado dos membros no card da tela inicial, permitindo que o criador admin expulse membros indesejados diretamente pela interface.

---

## Conversão de Visitante em Conta Permanente (Progressive Onboarding)
- **Banner Responsivo Superior ([src/components/GuestConversionBanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/GuestConversionBanner.tsx)):** Exibição de banner elegante no topo da aplicação quando o usuário estiver no modo visitante, com chamada para transformar o acesso de teste em uma conta definitiva.
- **Modal de Cadastro Adaptativo:** Ao tocar em "Criar conta", abre uma gaveta inferior suave no celular (`bottom-sheet`) e diálogo centralizado no desktop, solicitando Nome, E-mail e Senha.
- **Preservação de Dados e Renomeação Automática ([supabase/migrations/20261107_convert_guest_account.sql](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/supabase/migrations/20261107_convert_guest_account.sql)):** Atualização imediata das credenciais via Supabase Auth e renomeação automática do grupo de teste para "Nossa Casa", tornando o usuário o administrador oficial de sua conta sem perder os produtos ou simulações feitas durante a visita.

---

## Remoção de Senhas Hardcoded e Autenticação Anônima
- **Correção de Alerta de Segurança (GitGuardian) ([src/app/login/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/login/page.tsx)):** Eliminadas as constantes de credenciais temporárias que acionaram o scanner de segurança do GitGuardian. O login de visitante agora utiliza a autenticação anônima nativa do Supabase (`signInAnonymously`) e variáveis de ambiente, sem nenhuma senha escrita no código-fonte.

---

## Importação Inteligente de Cupom Fiscal (QR Code, PDF e Link SEFAZ)
- **Central de Entrada Multicanal ([src/app/mais/cupom/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/cupom/page.tsx) e [src/components/QrCodeScanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/QrCodeScanner.tsx)):** Criada a tela de importação em Mais > "Importar Cupom Fiscal" com leitor de QR Code integrado à câmera traseira/frontal, upload de Danfe em PDF e leitor de link ou texto colado.
- **Leitor e Parser de Cupons ([src/lib/cupom-parser.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-parser.ts) e [src/app/api/cupom/parse/route.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/api/cupom/parse/route.ts)):** Rota de API dedicada para consultar páginas da SEFAZ ou extrair texto de PDFs e cupons brutos, padronizando unidades, valores, quantidades e extração de marcas e mercado emissor.
- **Motor de Comparação e Semelhança ([src/lib/cupom-matcher.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-matcher.ts)):** Algoritmo inteligente que cruza o nome do item da nota com o catálogo do usuário via Levenshtein e Jaccard similarity, sugere o setor correto por palavras-chave e identifica marcas populares.
- **Tabela Comparativa e Conversão em Carrinho:** Interface responsiva que permite ao usuário escolher entre "É o mesmo" (atualizando o preço de histórico) ou "Cadastrar como novo" com nome limpo e setor sugerido. Gera automaticamente o carrinho ativo pronto para compra ao vivo ou finalização no histórico.

---

## Correção de Foco na Câmera e Leitor de PDF na Nuvem (Vercel)
- **Autofoco e Zoom na Câmera ([src/components/QrCodeScanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/QrCodeScanner.tsx)):** Adicionado foco contínuo (`focusMode: continuous`) no sensor da câmera, botão rápido de "2x Zoom" para ler QR Codes de papel térmico sem precisar aproximar tanto o celular, e botão "Tirar foto com o app da câmera (Foco Nítido)" que usa a câmera nativa do celular (com lente macro e foco a laser) como alternativa garantida.
- **Substituição da Biblioteca de PDF ([src/app/api/cupom/parse/route.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/api/cupom/parse/route.ts)):** Removido o pacote `pdf-parse` (que dependia de módulos binários C++ e quebrava nos servidores da Vercel retornando página de erro HTML em vez de dados) e implementado o `unpdf`, 100% puro em JavaScript e otimizado para nuvem.
- **Leitura Aprimorada de Danfe / NFC-e ([src/lib/cupom-parser.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-parser.ts)):** Suporte para extrair itens com tabelas em múltiplas linhas e formatos estaduais (incluindo SEFAZ Mato Grosso do Sul), identificando razão social, produtos, quantidades e preços sem falhas.

---

## Refinamento do Parser de PDF, Permissões de Câmera e Design da Barra Inferior
- **Correção Cirúrgica do Parser de Itens ([src/lib/cupom-parser.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-parser.ts) e [src/lib/cupom-matcher.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-matcher.ts)):** Corrigida a extração de comprovantes NFC-e (testado e validado diretamente com o PDF da SEFAZ-MS de 20 itens), separando corretamente a linha de descrição (`CENOURA kg`, `BATATA INGLESA kg`, etc.) das linhas de quantidade (`Qtde.: 0,83`), unidade (`kg`), valor unitário e valor total. Enriquecida também a inferência automática de setores (Hortifruti, Açougue, Padaria, Laticínios e Mercearia).
- **Acesso à Câmera Sem Falhas ([src/components/QrCodeScanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/QrCodeScanner.tsx)):** Removidas restrições rígidas de resolução mínima que impediam navegadores móveis de abrir o stream da câmera e adicionado botão de reativação de permissões com instruções claras.
- **Barra de Ação Responsiva ([src/app/mais/cupom/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/cupom/page.tsx)):** Redesenhado o rodapé da tabela comparativa com uma barra fixa translúcida (`backdrop-blur`) contendo o resumo dos itens à esquerda e o botão de ação à direita, eliminando quebras de linha e descompassos visuais em telas pequenas.
- **Toque na Tela para Focar a Câmera (Tap-to-Focus) ([src/components/QrCodeScanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/QrCodeScanner.tsx)):** Implementado toque direto na tela do visor para focar (`single-shot` com retorno contínuo e mapeamento de coordenadas `pointsOfInterest`), acompanhado de mira animada em tempo real e botão manual de "Focar" para garantir máxima nitidez ao aproximar cupons físicos.
- **Seletor de Lentes e Visor Amplo Vertical ([src/components/QrCodeScanner.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/components/QrCodeScanner.tsx)):** Adicionada detecção e seleção de lentes traseiras (permitindo alternar da lente 0.6x ultra-wide de foco fixo para a lente principal 1x que possui motor de autofoco físico), além de ampliar o visor para formato vertical (450px a 600px com botão de expandir) ideal para enquadrar cupons inteiros.

---

## Suporte a Descontos de Atacado, Agrupamento de Itens e Ajuste de Preço
- **Detecção de Descontos e Preços de Atacado ([src/lib/cupom-parser.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-parser.ts)):** O extrator agora identifica linhas de desconto por item aplicadas pelo PDV de supermercados/atacadistas (ex: `DESCONTO -13,10% R$ -0,30 1,99`), além de ler os blocos de totais de desconto da SEFAZ (`Descontos R$: 3,00` no resumo).
- **Agrupamento Automático de Itens Idênticos ([src/lib/cupom-parser.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-parser.ts)):** Itens bipados repetidamente na mesma compra (como 3 oréganos de 1 un) agora são consolidados automaticamente em uma única linha (3 un) com valores somados, tornando a conferência muito mais limpa e organizada.
- **Edição Direta de Preço Unitário na Tabela Comparativa ([src/app/mais/cupom/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/cupom/page.tsx)):** Adicionado campo numérico editável em cada produto da tabela para ajustar o preço unitário na hora, com recálculo automático do subtotal do item e do total geral do carrinho.
- **Botão de Preço de Atacado e Histórico Inteligente ([src/app/mais/cupom/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/cupom/page.tsx) e [src/lib/cupom-matcher.ts](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/lib/cupom-matcher.ts)):** Cada item possui um botão interativo para alternar entre "Preço Varejo" e "🏷️ Preço Atacado". Ao gerar o carrinho, o Pechincha salva na tabela `prices` do Supabase com `tipo: 'atacado'` ou `tipo: 'varejo'`, alimentando a inteligência de comparação de preços do app.
- **Aviso de Desconto SEFAZ na Conferência ([src/app/mais/cupom/page.tsx](file:///c:/Users/DIOGO/Documents/📁%20Projetos/Pechincha/src/app/mais/cupom/page.tsx)):** Quando a SEFAZ informa desconto global na nota (como os R$ 3,00), um aviso explicativo é exibido no topo da tela orientando o usuário a conferir os produtos que tiveram desconto no atacadista.













