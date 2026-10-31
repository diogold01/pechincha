# Pechincha — Visão Geral do Projeto, Stack e Arquitetura

Este documento reúne todas as informações técnicas, decisões de arquitetura, stack de tecnologias, estrutura do banco de dados e fluxos do aplicativo **Pechincha**, de forma clara e acessível.

---

## 1. O que é o Pechincha?
O **Pechincha** é um aplicativo web (PWA) de controle inteligente de compras de mercado voltado para casais e famílias. 
Ele resolve os principais problemas das compras do dia a dia:
- **Planejamento prévio:** montar o carrinho em casa sabendo com antecedência quanto vai custar (estimativa baseada nos últimos meses).
- **Modo Mercado ao vivo:** uso dentro do supermercado com celular em uma mão só, teclado numérico grande, cálculo do total real dos itens pegos, economia de atacado e ordenação dos setores pelos corredores físicos.
- **Sincronização em tempo real (Supabase Realtime):** quando um adiciona ou risca um item da lista, o outro vê na mesma hora na tela do seu próprio celular.
- **Controle de orçamento mensal por setor:** limites para Hortifruti, Carnes, Limpeza, etc., com barras coloridas em verde (até 80%), amarelo (80% a 100%) e vermelho (estourado).
- **Histórico e comparação de preços:** registra automaticamente o preço pago por mercado e por marca, indicando onde determinado produto costuma ser mais barato.
- **Resiliência offline:** se a internet cair dentro do mercado, o app continua funcionando (salva marcações e preços no aparelho) e sincroniza sozinho quando a conexão voltar.

---

## 2. Stack de Tecnologias (100% no Plano Gratuito)

| Camada | Tecnologia | Função no Projeto |
|---|---|---|
| **Front-end / Framework** | **Next.js 15 (App Router)** | Estrutura moderna de páginas em React com alta velocidade e suporte a Server/Client Components. |
| **Linguagem** | **TypeScript** | Garante segurança no código, previne erros de tipagem e facilita manutenções futuras. |
| **Estilização** | **Tailwind CSS** | Sistema de design limpo, responsivo, leve e com foco na experiência mobile. |
| **Ícones** | **Lucide React** | Pacote de ícones SVG modernos e consistentes em todas as telas. |
| **Banco de Dados & Auth** | **Supabase (PostgreSQL)** | Banco relacional na nuvem, autenticação por e-mail/senha e publicação em tempo real. |
| **Segurança** | **Row Level Security (RLS)** | Regras rígidas no PostgreSQL: um usuário só acessa os dados do seu próprio grupo familiar. |
| **Sincronização ao Vivo** | **Supabase Realtime** | Conexão WebSocket entre aparelhos para atualizar listas e carrinhos instantaneamente. |
| **Hospedagem** | **Vercel (Hobby)** | Publicação contínua integrada ao GitHub com deploy automático a cada alteração. |
| **Aplicativo Instalável** | **PWA (Progressive Web App)** | Permite instalar o site como app no Android (Chrome) e no iPhone (Safari), com ícone na tela de início. |
| **Armazenamento Offline** | **IndexedDB + LocalStorage** | Guarda o carrinho e uma fila de alterações no aparelho para quando o sinal estiver fraco. |
| **Keep-Alive Diário** | **Vercel Cron / API Route** | Consulta diária automática para evitar que o plano gratuito do Supabase pause por inatividade. |

---

## 3. Modelo de Dados (Tabelas no Supabase)

O banco é dividido em 12 tabelas protegidas por RLS, onde tudo pertence ao `group_id`:

1. **`groups`**: Guarda os grupos familiares (nome e fuso horário, ex: `America/Cuiaba`).
2. **`group_members`**: Vínculo dos usuários aos seus respectivos grupos e papel (`admin` ou membro).
3. **`group_invites`**: Códigos e links de convite de uso único para a segunda pessoa entrar.
4. **`group_settings`**: Configurações de preço do grupo (método: `media`, `ultimo` ou `menor`; meses da média: padrão 3; mercado padrão).
5. **`sectors`**: Setores de compra (Hortifruti, Carnes, Padaria, Limpeza, etc.) com emoji, orçamento mensal e ordem de exibição.
6. **`markets`**: Mercados cadastrados (ex: Assaí, Atacadão, Comper, Supermercado Local) e indicação do padrão.
7. **`market_sector_order`**: Ordem física dos corredores configurada individualmente para cada mercado.
8. **`products`**: Catálogo de produtos com nome, setor, unidade (`un`, `kg`, `g`, `L`, `ml`, `pacote`), emoji e status ativo.
9. **`prices`**: Histórico de preços registrados com valor, data, mercado, marca, tipo (`varejo` ou `atacado`), quantidade mínima e usuário criador.
10. **`carts`**: Carrinhos de compras com status (`planejado`, `em_compra`, `finalizado`), data e mercado.
11. **`cart_items`**: Itens do carrinho com quantidade, marca, preço estimado calculado, preço real pago, atacado aplicado e se está marcado como pego.
12. **`cart_payments`**: Formas de pagamento registradas na finalização (suporta pagamento misto, ex: Vale + Pix).

---

## 4. Estrutura de Pastas do Projeto

```text
pechincha/
├── .github/
│   └── workflows/
│       └── keep-supabase-alive.yml   # Template para automação via GitHub Actions
├── docs/
│   ├── keep-supabase-alive.yml       # Guia da rotina diária
│   ├── PROMPT.md                     # Planejamento original e regras de negócio
│   └── referencias/                  # Mockups visuais e HTMLs de referência
├── public/
│   ├── icon.svg                      # Ícone vetorial do aplicativo
│   └── sw.js                         # Service Worker para PWA e cache offline
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── keep-alive/route.ts   # Endpoint consultado diariamente para manter o banco ativo
│   │   ├── convite/[codigo]/page.tsx # Tela de entrada para convidados
│   │   ├── exportar/page.tsx         # Central de exportação CSV, backup e guia PWA
│   │   ├── historico/page.tsx        # Histórico completo de compras com botão "Repetir"
│   │   ├── login/page.tsx            # Tela de login e cadastro
│   │   ├── mais/page.tsx             # Cadastros de mercados, setores e configurações
│   │   ├── orcamento/page.tsx        # Acompanhamento do teto mensal por setor com barras coloridas
│   │   ├── produtos/page.tsx         # Catálogo com evolução de preços e comparativo por marca/mercado
│   │   ├── compra/page.tsx           # Planejamento do carrinho e modo mercado integrado
│   │   ├── apple-icon.tsx            # Gerador de ícone para iPhone (iOS)
│   │   ├── globals.css               # Estilos globais e tokens de cores
│   │   ├── icon.tsx                  # Gerador de ícone para Android e navegadores
│   │   ├── layout.tsx                # Layout mestre com fontes e registro do PWA
│   │   ├── manifest.ts               # Manifesto do PWA (nome, cores, display standalone)
│   │   └── page.tsx                  # Tela Inicial (card do mês, atalhos e últimos carrinhos)
│   ├── components/
│   │   ├── BottomNav.tsx             # Barra inferior de 5 abas (Início, Compra, Produtos, Orçamento, Mais)
│   │   ├── FrequentProductsBar.tsx   # Barra "Costumo comprar" baseada em compras recentes
│   │   ├── GroupOnboarding.tsx       # Criação do primeiro grupo e detecção de fuso horário
│   │   ├── LiveMarketMode.tsx        # Tela ao vivo do Modo Mercado (teclado numérico, corredores, swipe)
│   │   ├── PwaRegistrar.tsx          # Componente cliente para registrar o Service Worker
│   │   └── SupabaseSetupGuide.tsx    # Guia visual caso falte configurar credenciais
│   ├── lib/
│   │   ├── cart-actions.ts           # Ação para duplicar carrinhos antigos ("Repetir")
│   │   ├── format.ts                 # Formatação de moeda BRL, datas BR e motor de estatísticas de preços
│   │   ├── offline-sync.ts           # Mecanismo de IndexedDB, fila offline e auto-sync
│   │   ├── types.ts                  # Tipagem TypeScript de todas as entidades
│   │   └── supabase/
│   │       ├── client.ts             # Cliente Supabase para o navegador (Browser Client)
│   │       └── server.ts             # Cliente Supabase para o servidor (Server Client)
│   └── middleware.ts                 # Proteção de rotas e atualização de cookies de sessão
├── supabase/
│   └── schema.sql                    # Script SQL completo de tabelas, RLS e funções RPC
├── GEMINI.md                         # Regras de desenvolvimento do projeto
├── PROJETO.md                        # Este documento explicativo
├── REGISTRO.md                       # Log cronológico de todas as 8 etapas concluídas
└── vercel.json                       # Configuração de cron diário no Vercel
```

---

## 5. Como Rodar o Projeto Localmente

1. **Instalar dependências:**
   ```bash
   npm install
   ```
2. **Configurar variáveis de ambiente (`.env.local`):**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://sua-url.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```
3. **Executar o servidor:**
   ```bash
   npm run dev
   ```
4. Abrir no navegador: **`http://localhost:3000`**

---

## 6. Links e Ambientes
- **Repositório GitHub:** `https://github.com/diogold01/pechincha` (Privado)
- **Produção Vercel:** `https://pechincha-two.vercel.app`
- **Banco Supabase:** Projeto hospedado com PostgreSQL + Auth + Realtime
