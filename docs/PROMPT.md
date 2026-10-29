# PROMPT — App web de controle de compras de mercado (versão para o Antigravity)

> Cole este prompt inteiro no chat do Antigravity, com a pasta do projeto aberta. Ele contém todas as decisões já tomadas.

---

## 0. Primeira coisa a fazer

Eu vou colocar as telas de referência na pasta `docs/referencia/` do projeto (4 imagens `.png` e 4 arquivos `.html`). Olhe as imagens antes de começar; elas são o visual a seguir (veja a seção 7). Se a pasta ainda não existir, me avise.

Salve este prompt, exatamente como está, em `docs/PROMPT.md` na pasta do projeto (para não perdermos o contexto entre conversas) e crie um arquivo `REGISTRO.md` na raiz, onde você anotará as alterações de cada etapa. Se o Antigravity usar um arquivo de regras do projeto (como o `GEMINI.md`), coloque nele apenas um resumo curto das seções 1 e 11 e a indicação de ler `docs/PROMPT.md` antes de qualquer tarefa.

---

## 1. Seu papel e como trabalhar comigo

Você é um(a) desenvolvedor(a) full-stack sênior e vai construir comigo, do zero, um aplicativo web de controle de compras de mercado. Eu **não sei programar nem publicar na Vercel**, então explique tudo em português, em passos simples, sem presumir que eu conheço os termos técnicos.

**Regras de trabalho (importantes):**
1. Trabalhe **uma etapa por vez** (seção 12). Dentro da etapa, crie os arquivos completos e funcionais (nunca trechos soltos nem "o resto continua igual").
2. Ao terminar cada etapa, **pare**, deixe o app rodando para eu ver (quando fizer sentido) e escreva **no máximo 1 parágrafo** dizendo o que foi feito, sem listas longas.
3. Registre no `REGISTRO.md`, a cada etapa, as alterações feitas (arquivos criados ou mudados e o motivo, em linguagem simples).
4. **Espere eu dizer "continue"** antes de começar a próxima etapa.
5. **Não reescreva arquivos já concluídos**, a menos que eu peça ou que seja indispensável (e, nesse caso, explique o motivo antes).
6. **No início de cada etapa, lembre-me do modelo e do esforço recomendados** (tabela da seção 12), porque eu é que troco o modelo no seletor.
7. Antes de rodar qualquer comando que instale algo, apague arquivos ou altere configurações, explique em uma frase o que ele faz.
8. Todo o texto da interface, mensagens e comentários do código em **português do Brasil**. Valores em **R$ (BRL)**, datas dd/mm/aaaa, vírgula como separador decimal.
9. Se uma decisão não estiver neste prompt, escolha a opção mais simples e me avise em uma frase, em vez de me fazer várias perguntas.

---

## 2. Objetivo do app

Dar **controle total das compras de mercado**: cadastrar produtos, guardar o histórico de preços (por data, mercado e marca), montar um carrinho antes de ir ao mercado para ter uma estimativa do gasto, usar o carrinho **ao vivo** dentro do mercado e acompanhar o **orçamento mensal por setor**.

Usuários iniciais: eu (Android) e minha namorada (iPhone), compartilhando os mesmos dados. A estrutura deve permitir que outras pessoas/famílias usem no futuro, cada uma com seus próprios dados isolados.

---

## 3. Stack e hospedagem (tudo no plano gratuito)

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **Supabase**: banco Postgres, autenticação (e-mail e senha), Realtime (sincronização ao vivo) e RLS (segurança por linha)
- **Vercel** (plano Hobby, uso pessoal) para hospedar, com deploy automático a partir do GitHub
- **PWA**: manifest, ícones, service worker, instalável no Android (Chrome → "Instalar app") e no iPhone (Safari → Compartilhar → "Adicionar à Tela de Início"). Inclua um passo a passo curto para os dois.
- A Vercel **não guarda dados**; todos os dados ficam no Supabase. Não usar o Google Drive.
- **Contas:** eu mesmo(a) crio as contas no GitHub, Supabase e Vercel (já orientado). Você me guia em **onde clicar** para conectar tudo e **onde copiar as chaves**.
- **Supabase gratuito pausa o projeto após 7 dias com pouca atividade** (os dados não são apagados; dá para retomar). Para evitar isso, na etapa 8 crie uma **tarefa automática diária no GitHub Actions** que faz uma consulta simples ao banco. Não usar notificações no celular para isso.
- Botão de **backup/exportação em CSV** dentro do app.
- Se um dia o app for usado comercialmente por outras pessoas, o plano Hobby da Vercel deixa de servir (aviso, sem ação agora).

---

## 4. Login, grupos e segurança

- Login com e-mail e senha.
- Conceito de **grupo** (casal/família): todos os dados (produtos, mercados, preços, carrinhos, setores) pertencem ao **grupo**, não ao usuário. Cada grupo só enxerga os próprios dados (**RLS por `group_id` em todas as tabelas**).
- Primeiro usuário cria o grupo; a segunda pessoa entra por **convite** (código ou link). O cadastro **não deve ser aberto a qualquer pessoa** que descubra o endereço: só entra quem tiver convite.
- A interface não precisa mostrar troca de grupos agora, mas o banco já deve suportar vários grupos.
- Fuso horário do grupo: **detectado pelo celular/navegador** no momento de criar o grupo (com America/Cuiaba como padrão se não detectar), editável nas configurações. Usado para definir "o mês" do orçamento.

---

## 5. Modelo de dados (sugestão — ajuste se encontrar algo melhor e me avise)

- `groups` (id, nome, fuso_horario, criado_em)
- `group_members` (group_id, user_id, papel)
- `group_invites` (group_id, código, e-mail opcional, usado_em)
- `group_settings` (group_id, metodo_preco: `media` | `ultimo` | `menor`, meses_media [padrão 3], mercado_padrao_id)
- `sectors` (id, group_id, nome, emoji, orcamento_mensal, ordem)
- `markets` (id, group_id, nome, padrao)
- `market_sector_order` (market_id, sector_id, posicao) — ordem dos setores conforme os corredores de cada mercado
- `products` (id, group_id, nome, sector_id, unidade [un, kg, g, L, ml, pacote…], emoji opcional, **codigo_barras nullable (reservado, sem uso por enquanto)**, ativo)
- `prices` (id, group_id, product_id, market_id, **marca nullable**, valor, tipo: `varejo` | `atacado`, quantidade_minima [padrão 1], data, criado_por, cart_item_id nullable)
- `carts` (id, group_id, nome, market_id, status: `planejado` | `em_compra` | `finalizado`, data_planejada, finalizado_em, criado_por)
- `cart_payments` (id, cart_id, forma_pagamento, valor) — **permite pagamento misto** (mais de uma forma por compra)
- `cart_items` (id, cart_id, product_id, marca nullable, quantidade, preco_estimado, preco_real nullable, marcado, atacado_aplicado, ordem)

Setores padrão já criados com o grupo (todos **editáveis, removíveis e com novos setores possíveis**; orçamento inicial vazio, com aviso "defina um valor"):
🥬 Hortifruti · 🥩 Açougue e peixaria · 🍞 Padaria · 🧀 Laticínios e frios · 🥫 Mercearia · 🥤 Bebidas · 🧽 Limpeza · 🧴 Higiene e perfumaria · 🧊 Congelados · 🐾 Pet · 🛒 Outros

---

## 6. Regras de negócio

**Preço estimado (por produto)**
- Padrão: **média dos preços de varejo dos últimos N meses** (N = 3, configurável; trabalhar com meses, não com número de compras).
- Métodos alternativos configuráveis: **último preço** e **menor preço**.
- Dar prioridade a preços do **mesmo mercado do carrinho**; se não houver, usar os de outros mercados e indicar discretamente.
- Se o item tem **marca** escolhida, usar os preços dessa marca; se não houver histórico dela, usar o produto geral e indicar.
- Se não houver preço no período, usar o **último conhecido** e marcar como "desatualizado". Se nunca houve preço, pedir para digitar.
- Em todo produto, mostrar também **último, menor e maior** preço.

**Mercados e marcas**
- Cadastro de vários mercados; um é o **padrão**. O mercado é escolhido **uma vez por carrinho** (não item por item) e cada preço pode ser editado depois.
- Compramos quase sempre no mesmo mercado, mas às vezes testamos outros para pesquisar preços: comparar preço do mesmo produto entre mercados e indicar onde está mais barato.
- A **marca** é um campo de texto com autocompletar (marcas já usadas) no preço e no item do carrinho. Permite comparar marcas do mesmo produto.

**Atacado (função secundária, discreta)**
- Fica escondido por padrão: aparece só no formulário de preço, em "Mais opções (atacado)", com a quantidade mínima.
- Preços de atacado **não entram na média do varejo**. São mostrados separados, com o **preço por unidade**.
- No carrinho, se a quantidade atingir o mínimo, usar o preço de atacado e mostrar a economia ("levando 12, você economiza R$ X").

**Finalizar um carrinho**
- Os preços reais digitados viram automaticamente **registros de histórico** (`prices`) com data, mercado e marca. Evitar duplicar se o carrinho for reeditado.
- **Forma de pagamento opcional**, com **pagamento misto** permitido: o usuário pode informar mais de uma forma e o valor de cada (Dinheiro, Pix, Débito, Crédito, Vale-alimentação, Outro). Se informar, os valores devem somar o total (avisar a diferença, sem bloquear).

**Orçamento por setor**
- Cada setor tem um valor mensal. Gasto do mês = soma (preço real × quantidade) dos carrinhos **finalizados** no mês.
- Barra de progresso: **verde** até 80%, **amarelo** de 80% a 100%, **vermelho** acima de 100% (limites em constantes fáceis de mudar).
- Ao **planejar um carrinho**, avisar de forma **singela** (uma linha pequena, sem pop-up) quando gasto do mês + estimado do carrinho ultrapassar o orçamento de um setor: ex.: "Esse carrinho estoura Açougue em R$ 40".
- Verde/amarelo/vermelho ficam **reservados ao orçamento** em todo o app.

**Outras regras**
- **Copiar carrinho:** a partir de um carrinho antigo, criar um novo (compra do mês) com os mesmos itens e preços reestimados.
- **Histórico de carrinhos** com data, mercado, setores e total.
- **"Costumo comprar":** ao planejar, mostrar no topo os produtos mais frequentes (últimos 3 meses) para adicionar com um toque. Implementar de forma **fácil de remover** (eu quero ver funcionando antes de decidir se gosto).
- **Sincronização ao vivo** entre nós dois (Supabase Realtime): se um adiciona/marca um item, o outro vê na hora. Em conflito, vale a última alteração por item.
- **Exportação CSV:** (a) compras finalizadas: data, mercado, setor, total, formas de pagamento (para eu importar no meu app de finanças, sem integração direta por enquanto); (b) backup completo das tabelas.

---

## 7. Telas e navegação

**Mobile primeiro** (uso no mercado é no celular, às vezes em tablet). No tablet, layout responsivo com alvos de toque grandes; no computador (cadastros e relatórios), barra lateral e duas colunas.

Barra inferior com 5 itens: **Início · Compra · Produtos · Orçamento · Mais**. Em **"Mais"**: Mercados, Histórico de carrinhos, Configurações, Exportar/backup.

- **Início:** card do mês (gasto total × orçamento total, com barra simples e chips dos setores em alerta), card **"Continuar compra"** quando houver uma em andamento, botão **"Nova compra"** e os **últimos carrinhos**, que podem ser repetidos com um toque.
- **Produtos:** lista com busca e filtro por setor; ao abrir um produto, histórico de preços (gráfico simples), último/menor/maior/média, por mercado e por marca.
- **Planejar carrinho:** escolher produtos e quantidades, ver total estimado por setor e avisos de orçamento.
- **Modo mercado (carrinho ao vivo — a tela mais importante):**
  - **Total fixo no topo:** real em destaque e estimado em cinza ao lado, com barra de progresso dos itens.
  - Lista **agrupada por setor**, na ordem dos corredores do mercado escolhido (setores **arrastáveis** para reordenar; a ordem fica salva por mercado).
  - Tocar no item marca como pego; deslizar remove; tocar no preço abre um painel (bottom sheet) com **teclado numérico grande** (`inputMode="decimal"`), escolha de marca, quantidade e, em "Mais opções (atacado)", o preço de atacado.
  - Ao digitar o preço, mostrar um **chip discreto** de comparação, ex.: "média R$ 8,90 · ▲ 6%".
  - Botão flutuante **"+"** com busca instantânea para adicionar produto (e cadastrar rápido se não existir).
  - Aviso de setor estourado: apenas **cor no cabeçalho do setor** e uma linha pequena.
  - Botão **"Finalizar compra"** fixo no rodapé.
- **Orçamento:** total do mês e lista de setores com valor mensal, barra de progresso colorida e percentual, gasto do mês, botão para criar setor e edição de cada setor (nome, emoji, valor, excluir).
- **Mercados, Histórico, Configurações** (método de preço, meses da média, mercado padrão, fuso horário).

**Referência visual aprovada:** as 4 telas de exemplo (Início, Modo mercado, Preço do item e Orçamento) estão na pasta `docs/referencia/`, em imagem (`.png`) e em HTML (`.html`). **Siga esse visual** (layout, tamanhos, cores, textos de aviso e a forma dos componentes). Os nomes e valores nelas são só exemplos. Uma correção em relação à referência: no Modo mercado, a lista deve ter espaço extra no fim para que o botão flutuante "+" nunca cubra o preço do último item.

Cores e componentes da referência: fundo claro `#F4F5F9`, cartões brancos com borda `#E4E6EE` e cantos arredondados, cor de destaque azul `#3B4CCA`, fonte Plus Jakarta Sans, verde `#1F9D57`, amarelo `#E8A200`, vermelho `#D64545` (estes três só para orçamento).

---

## 8. Design e experiência

- Referência de fluidez: apps como **iFood e 99** — poucos toques, uma ação principal por tela, nada de menus escondidos.
- Em vez de abrir telas novas, usar **painéis que sobem de baixo (bottom sheets)** para editar preço, adicionar produto, escolher mercado etc.
- Visual limpo, cantos arredondados, **uma única cor de destaque**, **tema claro e escuro automáticos** (conforme o aparelho).
- **Emojis** em setores e produtos para reconhecimento rápido (sem imagens pesadas).
- Alvos de toque de pelo menos 44 px; fonte legível; sem poluição visual.
- **Esqueletos de carregamento** (cinza) em vez de "rodinha girando"; atualizações **otimistas** (a tela muda na hora e sincroniza em seguida).

---

## 9. Funcionar com sinal ruim

Mercados costumam ter internet fraca. O **carrinho em modo mercado** deve salvar as alterações no aparelho (IndexedDB/localStorage), continuar funcionando sem internet e **sincronizar automaticamente** quando a conexão voltar, sem travar a tela esperando o servidor. Mostrar um indicador pequeno de "sincronizando / offline".

---

## 10. Fora do escopo por enquanto (não implementar, mas não bloquear)

- **Código de barras / leitura por câmera:** deixado de lado. O campo `codigo_barras` já existe no banco, sem uso.
- Integração direta com meu app de finanças (apenas o CSV).
- Notificações push, troca de grupos na interface.

---

## 11. Segurança e observações técnicas

- RLS ativo em **todas** as tabelas; nunca expor a chave de serviço (`service_role`) no front-end.
- As chaves do Supabase ficam em `.env.local` (e nas variáveis de ambiente da Vercel). **Antes do primeiro envio ao GitHub, confirme que `.env.local` está no `.gitignore`** e nunca coloque chaves, senhas ou tokens em arquivos que vão para o Git. O repositório é **privado**.
- Eu não vou colar senhas nem chaves no chat: indique o arquivo e o campo onde devo colocá-las.
- Validar dados (valores positivos, quantidades válidas) e tratar erros com mensagens simples em português.
- Código organizado e comentado em português; poucas dependências.

---

## 12. Etapas do projeto e modelo/esforço recomendados

Siga esta ordem, uma etapa por vez, aguardando meu **"continue"**. No início de cada etapa, me lembre do modelo e do esforço.

| Etapa | O que entra | Modelo Recomendado | Esforço (Effort) |
|---|---|---|---|
| 1 | **Preparação:** criar o projeto Next.js (TypeScript + Tailwind) na pasta, ligar ao GitHub, ligar à Vercel e publicar no ar; configurar `.env.local` e `.gitignore` | **Gemini 3.8 Flash** ou **Claude Sonnet 5.5** | Low |
| 2 | **Banco, login e grupo:** tabelas, RLS, criação de grupo, convite para a segunda pessoa e revisão rigorosa de segurança | **Claude Opus 5.5** | High |
| 3 | **Cadastros:** mercados, setores (com os padrões), produtos, preços com marca e atacado discreto, histórico de preços | **Claude Sonnet 5.5** | Medium |
| 4 | **Planejamento de carrinho:** cálculo de estimativas (meses, mercado, marca, atacado), avisos de orçamento e "Costumo comprar" | **Claude Sonnet 5.5** | High |
| 5 | **Modo mercado:** total fixo, setores arrastáveis, bottom sheet com teclado numérico, chip de comparação e pagamento misto | **Claude Sonnet 5.5** | High |
| 6 | **Aba Orçamento:** barras coloridas reservadas ao orçamento, percentuais e edição de setores | **Gemini 4 Argon** ou **Claude Sonnet 5.5** | Low |
| 7 | **Histórico de carrinhos, copiar carrinho e sincronização ao vivo:** Supabase Realtime a dois | **Claude Opus 5.5** | Medium |
| 8 | **PWA, modo offline, exportação CSV e GitHub Actions:** IndexedDB/localStorage resiliente e automação diária | **Claude Opus 5.5** | High |

> **Alternativas de cota:** Se a cota dos modelos Claude atingir o limite temporário, utilize o **Gemini 4 Argon** ou **Gemini 3.8 Flash** configurados em esforço **High**.

---

## 13. Primeira instrução

Faça o que está na seção 0 e depois confirme em poucas linhas que entendeu o projeto, listando **apenas dúvidas que realmente bloqueiem** o início (se não houver, diga que não há). Em seguida, aguarde eu dizer **"continue"** para começar pela etapa 1.
