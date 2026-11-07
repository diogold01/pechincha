# Pechincha

Aplicativo web progressivo (PWA) para controle colaborativo de compras de mercado, histórico de preços por estabelecimento e acompanhamento de orçamento mensal por setor.

🔗 **Deploy em produção:** [https://pechincha-two.vercel.app](https://pechincha-two.vercel.app)

---

## Telas da Aplicação

<!-- Espaço reservado para capturas de tela do celular -->
<p align="center">
  <img src="docs/screenshots/modo-mercado.png" alt="Modo Mercado ao Vivo" width="30%" />
  <img src="docs/screenshots/planejamento-compra.png" alt="Planejamento de Compra" width="30%" />
  <img src="docs/screenshots/dashboard-orcamento.png" alt="Dashboard e Orçamento" width="30%" />
</p>

> *Sugestão de capturas para adicionar na pasta `docs/screenshots/`:*
> 1. `modo-mercado.png`: Tela do Modo Mercado ao vivo com teclado numérico 3x4 aberto registrando o preço na prateleira.
> 2. `planejamento-compra.png`: Tela de planejamento de compra com o carrossel de itens frequentes e estimativa de total.
> 3. `dashboard-orcamento.png`: Tela inicial ou de orçamento exibindo as barras de progresso por setor (verde, amarelo e vermelho).

---

## Funcionalidades Implementadas

### 1. Colaboração em Tempo Real e Multi-dispositivo
- **Autenticação e Grupos:** Cadastro e login por e-mail e senha. Compartilhamento do mesmo ambiente de compras entre membros de uma família/casal via `group_id`.
- **Sistema de Convites:** Emissão de convites com código único (`PECH-XXXX`) e links diretos (`/convite/[codigo]`) para inclusão de novos membros.
- **Sincronização ao Vivo:** Atualização instantânea dos carrinhos e itens marcados entre múltiplos dispositivos conectados usando canais do Supabase Realtime.

### 2. Modo Mercado (Operação ao Vivo na Prateleira)
- **Ergonomia Mobile:** Interface focada em uso com uma mão, dividida em setores organizados pelo trajeto físico do mercado selecionado.
- **Teclado Numérico 3x4 Customizado:** Entrada rápida de centavos em tela cheia com alternância entre valores monetários (R$) e peso por quilo (KG).
- **Variações de Produto:** Detecção de produto existente ao adicionar itens, permitindo escolher entre **Agrupar** (mantendo preço e somando quantidade) ou **Separar em nova linha** (para registrar diferentes marcas, sabores ou preços na mesma compra).
- **Histórico Automático de Preços:** Gravação imediata do valor digitado na tabela de preços atrelada à data, mercado e marca do item.
- **Pagamento Misto:** Suporte ao encerramento da compra com divisão de valores entre múltiplas formas de pagamento (ex.: Vale Refeição e Cartão de Crédito).

### 3. Planejamento de Compras e Estimativa
- **Lista Rápida:** Carrossel de produtos mais comprados ("Costumo Comprar") para adição à lista com um toque.
- **Deduplicação Inteligente:** Busca rápida de produtos com cadastro inline sem duplicar registros no banco.
- **Cálculo de Estimativa:** Projeção do gasto da compra antes de ir ao mercado com base no histórico anterior (configurável entre média dos últimos 3 meses, último preço ou menor preço histórico).
- **Repetição de Compras:** Clonagem de carrinhos anteriores finalizados com recalculo imediato de estimativas.

### 4. Orçamento Mensal por Setor
- **11 Setores de Supermercado:** Hortifruti, Açougue/Peixaria, Padaria, Laticínios/Frios, Mercearia, Bebidas, Limpeza, Higiene/Perfumaria, Congelados, Pet e Outros.
- **Tetos de Gastos:** Definição de orçamento global da casa e tetos individuais por setor.
- **Alertas de Consumo:** Indicadores visuais de aproximação de limite (80%) e estouro de orçamento (100%) sincronizados com o fuso horário local configurado.

### 5. Resiliência Offline e PWA
- **Operação Sem Conexão:** Registro de preços e marcação de itens armazenados em fila local (`localStorage`) para supermercados sem cobertura 4G/Wi-Fi.
- **Resolução de Conflitos:** Remapeamento automático de IDs temporários locais para UUIDs definitivos do banco após o restabelecimento da conexão.
- **PWA Instalável:** Manifesto Web App (`manifest.webmanifest`) e Service Worker para instalação como aplicativo na tela inicial do celular.

### 6. Exportação, Backup e Automação
- **Exportação CSV:** Extração das compras finalizadas e do histórico de preços para análise externa em planilhas.
- **Backup e Restauração:** Dump completo do banco de dados em formato JSON estruturado e ferramenta de importação com validação de esquema.
- **Keep-Alive:** Endpoint `/api/keep-alive` e workflow agendado no GitHub Actions para evitar pausa do projeto na camada gratuita do Supabase por inatividade.

### 7. Arquitetura Responsiva
- **Mobile-First:** Viewport travado contra vazamento lateral (`viewport-fit=cover`, `overflow-x: hidden`) e janelas modais em formato de gaveta inferior.
- **Desktop e Tablet:** Layout adaptativo com Sidebar lateral fixa (`w-64`), visualização de dados em grade de 2 a 3 colunas e modais centralizados.

---

## Próximos Passos (Backlog)

- [ ] Leitura e extração de itens de cupom fiscal via câmera/upload (OCR e QR Code de NFC-e).
- [ ] Gráficos analíticos de variação histórica e sazonalidade de preços por item.
- [ ] Notificações push via Web Push API sobre alterações no carrinho em tempo real.

---

## Stack Tecnológica

- **Front-end & Aplicação:** [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/)
- **Estilização & UI:** [Tailwind CSS 3](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) (ícones)
- **Autenticação & Banco de Dados:** [Supabase](https://supabase.com/) (PostgreSQL 15, Supabase Auth via cookies com `@supabase/ssr`, Supabase Realtime)
- **Segurança:** Row Level Security (RLS) estrito com isolamento de dados por grupo em todas as tabelas e funções `SECURITY DEFINER`
- **PWA / Armazenamento Local:** Service Worker nativo e sincronização assíncrona com `localStorage`
- **Deploy & Infraestrutura:** [Vercel](https://vercel.com/) (Edge Middleware e Serverless Functions)

---

## Como Rodar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18.18+ ou 20+)
- Gerenciador de pacotes `npm` (ou `pnpm` / `yarn`)
- Instância ativa no [Supabase](https://supabase.com/)

### 1. Clonar o repositório
```bash
git clone https://github.com/diogold01/pechincha.git
cd pechincha
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar o banco de dados (Supabase)
1. Crie um novo projeto no Supabase.
2. No painel do projeto, abra o **SQL Editor** e execute o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql).
3. Em seguida, execute a migration [`supabase/migrations/20261107_ensure_user_group.sql`](supabase/migrations/20261107_ensure_user_group.sql).
4. Em **Authentication** → **Providers** → **Email**, desative a opção *Confirm email* caso prefira login imediato sem envio de e-mail de ativação.

### 4. Configurar as variáveis de ambiente
Crie um arquivo `.env.local` na raiz do projeto com base no modelo [`.env.example`](.env.example):

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica-aqui
```

> **Atenção:** Utilize exclusivamente a chave **anon (public)**. Nunca informe ou exponha a chave `service_role` nas variáveis de ambiente do front-end.

### 5. Executar o servidor de desenvolvimento
```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no navegador.

### 6. Validar build de produção
```bash
npm run build
```

---

## Estrutura do Projeto

```
pechincha/
├── docs/                   # Referências visuais e workflow de keep-alive
├── public/                 # Manifest PWA, ícones e Service Worker
├── src/
│   ├── app/                # Rotas da aplicação (Next.js App Router)
│   │   ├── compra/         # Planejamento e Modo Mercado
│   │   ├── convite/        # Aceite de convite de compartilhamento
│   │   ├── exportar/       # CSV, Backup JSON e guia PWA
│   │   ├── historico/      # Compras passadas e repetição
│   │   ├── login/          # Autenticação e cadastro
│   │   ├── mais/           # Mercados, setores e configurações
│   │   ├── orcamento/      # Metas e tetos por categoria
│   │   ├── produtos/       # Catálogo e histórico de preços
│   │   └── page.tsx        # Dashboard principal da casa
│   ├── components/         # Componentes compartilhados e modais
│   │   ├── BottomNav.tsx   # Barra de navegação móvel
│   │   ├── LiveMarketMode.tsx # Interface do Modo Mercado e teclado 3x4
│   │   └── Sidebar.tsx     # Menu lateral para telas desktop
│   ├── lib/                # Lógicas de negócio, formatos e conexões
│   │   ├── cart-actions.ts # Ações de carrinho e repetição
│   │   ├── format.ts       # Formatadores monetários (BRL) e datas
│   │   ├── offline-sync.ts # Fila offline e reconciliação
│   │   └── supabase/       # Clientes do Supabase (Browser e Server)
│   └── middleware.ts       # Validação e renovação de tokens de sessão
└── supabase/
    ├── migrations/         # Migrações pontuais
    └── schema.sql          # Esquema completo do banco e políticas RLS
```
