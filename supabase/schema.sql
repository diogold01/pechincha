-- ============================================================================
-- PECHINCHA — SCRIPT DE BANCO DE DADOS E SEGURANÇA (RLS) — ETAPA 2
-- Execute este script inteiro no "SQL Editor" do painel do Supabase.
-- ============================================================================

-- Extensão para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CRIAÇÃO DAS TABELAS (Seção 5 do PROMPT.md)
-- ============================================================================

-- 1.1. Grupos (casal / família)
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(trim(nome)) > 0),
  fuso_horario text NOT NULL DEFAULT 'America/Cuiaba' CHECK (char_length(trim(fuso_horario)) > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.groups IS 'Grupos de compras (casal/família). Todos os dados do app pertencem a um grupo.';

-- 1.2. Membros do grupo
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'membro' CHECK (papel IN ('admin', 'membro')),
  nome_exibicao text NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
COMMENT ON TABLE public.group_members IS 'Relaciona os usuários autenticados aos grupos aos quais pertencem.';

-- 1.3. Convites para entrar no grupo
CREATE TABLE IF NOT EXISTS public.group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  codigo text NOT NULL UNIQUE CHECK (char_length(trim(codigo)) >= 6),
  email text NULL,
  usado_em timestamptz NULL,
  usado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON public.group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_codigo ON public.group_invites(codigo);
COMMENT ON TABLE public.group_invites IS 'Códigos de convite de uso único para adicionar a segunda pessoa ao grupo.';

-- 1.4. Mercados
CREATE TABLE IF NOT EXISTS public.markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(trim(nome)) > 0),
  padrao boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_markets_group_id ON public.markets(group_id);
COMMENT ON TABLE public.markets IS 'Mercados cadastrados pelo grupo.';

-- 1.5. Configurações do grupo
CREATE TABLE IF NOT EXISTS public.group_settings (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  metodo_preco text NOT NULL DEFAULT 'media' CHECK (metodo_preco IN ('media', 'ultimo', 'menor')),
  meses_media integer NOT NULL DEFAULT 3 CHECK (meses_media >= 1 AND meses_media <= 24),
  mercado_padrao_id uuid NULL REFERENCES public.markets(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.group_settings IS 'Preferências de cálculo de preço estimado e mercado padrão do grupo.';

-- 1.6. Setores (corredores / categorias de orçamento)
CREATE TABLE IF NOT EXISTS public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(trim(nome)) > 0),
  emoji text NOT NULL DEFAULT '🛒',
  orcamento_mensal numeric(12, 2) NULL CHECK (orcamento_mensal IS NULL OR orcamento_mensal >= 0),
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sectors_group_id ON public.sectors(group_id);
COMMENT ON TABLE public.sectors IS 'Setores de mercado e seus respectivos tetos de orçamento mensal.';

-- 1.7. Ordem dos setores por mercado (conforme corredores de cada mercado)
CREATE TABLE IF NOT EXISTS public.market_sector_order (
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  posicao integer NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, sector_id)
);

CREATE INDEX IF NOT EXISTS idx_market_sector_order_group_id ON public.market_sector_order(group_id);
COMMENT ON TABLE public.market_sector_order IS 'Ordem personalizada dos setores conforme a disposição dos corredores de cada mercado.';

-- 1.8. Produtos
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(trim(nome)) > 0),
  sector_id uuid NULL REFERENCES public.sectors(id) ON DELETE SET NULL,
  unidade text NOT NULL DEFAULT 'un' CHECK (char_length(trim(unidade)) > 0),
  emoji text NULL,
  codigo_barras text NULL, -- Reservado para uso futuro
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_group_id ON public.products(group_id);
CREATE INDEX IF NOT EXISTS idx_products_sector_id ON public.products(sector_id);
COMMENT ON TABLE public.products IS 'Catálogo de produtos do grupo.';

-- 1.9. Carrinhos de compra
CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(trim(nome)) > 0),
  market_id uuid NULL REFERENCES public.markets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'em_compra', 'finalizado')),
  data_planejada date NOT NULL DEFAULT CURRENT_DATE,
  finalizado_em timestamptz NULL,
  criado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carts_group_id ON public.carts(group_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON public.carts(group_id, status);
COMMENT ON TABLE public.carts IS 'Carrinhos planejados, em andamento no mercado ou finalizados.';

-- 1.10. Itens do carrinho
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  marca text NULL,
  quantidade numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_estimado numeric(12, 2) NULL CHECK (preco_estimado IS NULL OR preco_estimado >= 0),
  preco_real numeric(12, 2) NULL CHECK (preco_real IS NULL OR preco_real >= 0),
  marcado boolean NOT NULL DEFAULT false,
  atacado_aplicado boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_group_id ON public.cart_items(group_id);
COMMENT ON TABLE public.cart_items IS 'Itens dentro de um carrinho de compras.';

-- 1.11. Pagamentos do carrinho (suporta pagamento misto)
CREATE TABLE IF NOT EXISTS public.cart_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  forma_pagamento text NOT NULL CHECK (
    forma_pagamento IN ('Dinheiro', 'Pix', 'Débito', 'Crédito', 'Vale-alimentação', 'Outro')
  ),
  valor numeric(12, 2) NOT NULL CHECK (valor > 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_payments_cart_id ON public.cart_payments(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_payments_group_id ON public.cart_payments(group_id);
COMMENT ON TABLE public.cart_payments IS 'Formas de pagamento utilizadas ao finalizar um carrinho (permite pagamento misto).';

-- 1.12. Histórico de preços
CREATE TABLE IF NOT EXISTS public.prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  marca text NULL,
  valor numeric(12, 2) NOT NULL CHECK (valor > 0),
  tipo text NOT NULL DEFAULT 'varejo' CHECK (tipo IN ('varejo', 'atacado')),
  quantidade_minima numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantidade_minima > 0),
  data date NOT NULL DEFAULT CURRENT_DATE,
  criado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  cart_item_id uuid NULL REFERENCES public.cart_items(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prices_group_product ON public.prices(group_id, product_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_prices_market ON public.prices(market_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prices_unique_cart_item ON public.prices(cart_item_id) WHERE cart_item_id IS NOT NULL;
COMMENT ON TABLE public.prices IS 'Histórico de preços de varejo e atacado por produto, mercado, marca e data.';


-- ============================================================================
-- 2. TRIGGERS DE INTEGRIDADE ENTRE GRUPOS (ANTI CROSS-TENANT)
-- Garante que tabelas filhas herdem e validem o mesmo group_id da tabela pai
-- ============================================================================

-- 2.1. Sincroniza e valida group_id em market_sector_order
CREATE OR REPLACE FUNCTION public.trg_sync_market_sector_order_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_market_group uuid;
  v_sector_group uuid;
BEGIN
  SELECT group_id INTO v_market_group FROM public.markets WHERE id = NEW.market_id;
  SELECT group_id INTO v_sector_group FROM public.sectors WHERE id = NEW.sector_id;

  IF v_market_group IS NULL OR v_sector_group IS NULL OR v_market_group <> v_sector_group THEN
    RAISE EXCEPTION 'Mercado e setor devem pertencer ao mesmo grupo.';
  END IF;

  NEW.group_id := v_market_group;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_ins_upd_market_sector_order ON public.market_sector_order;
CREATE TRIGGER before_ins_upd_market_sector_order
BEFORE INSERT OR UPDATE ON public.market_sector_order
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_market_sector_order_group();

-- 2.2. Sincroniza e valida group_id em cart_items
CREATE OR REPLACE FUNCTION public.trg_sync_cart_items_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_group uuid;
  v_product_group uuid;
BEGIN
  SELECT group_id INTO v_cart_group FROM public.carts WHERE id = NEW.cart_id;
  SELECT group_id INTO v_product_group FROM public.products WHERE id = NEW.product_id;

  IF v_cart_group IS NULL OR v_product_group IS NULL OR v_cart_group <> v_product_group THEN
    RAISE EXCEPTION 'Carrinho e produto devem pertencer ao mesmo grupo.';
  END IF;

  NEW.group_id := v_cart_group;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_ins_upd_cart_items ON public.cart_items;
CREATE TRIGGER before_ins_upd_cart_items
BEFORE INSERT OR UPDATE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_cart_items_group();

-- 2.3. Sincroniza e valida group_id em cart_payments
CREATE OR REPLACE FUNCTION public.trg_sync_cart_payments_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_group uuid;
BEGIN
  SELECT group_id INTO v_cart_group FROM public.carts WHERE id = NEW.cart_id;

  IF v_cart_group IS NULL THEN
    RAISE EXCEPTION 'Carrinho inválido.';
  END IF;

  NEW.group_id := v_cart_group;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_ins_upd_cart_payments ON public.cart_payments;
CREATE TRIGGER before_ins_upd_cart_payments
BEFORE INSERT OR UPDATE ON public.cart_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_cart_payments_group();


-- ============================================================================
-- 3. FUNÇÕES DE SEGURANÇA E FLUXO DE GRUPO / CONVITES
-- ============================================================================

-- 3.1. Verifica se o usuário logado pertence a um determinado group_id
-- Usada nas políticas RLS com SECURITY DEFINER para evitar recursão infinita
CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = target_group_id
      AND user_id = auth.uid()
  );
$$;

-- 3.2. Retorna todos os group_ids do usuário autenticado
CREATE OR REPLACE FUNCTION public.get_user_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT group_id
  FROM public.group_members
  WHERE user_id = auth.uid();
$$;

-- 3.3. Verifica se o sistema já possui algum grupo criado e valida código de convite
-- Permite bloquear cadastros abertos sem convite após o 1º usuário criar seu grupo
CREATE OR REPLACE FUNCTION public.check_registration_status(p_invite_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_groups boolean := false;
  v_invite_id uuid := NULL;
  v_group_name text := NULL;
  v_restricted_email text := NULL;
  v_clean_code text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.groups LIMIT 1) INTO v_has_groups;

  IF p_invite_code IS NOT NULL AND char_length(trim(p_invite_code)) > 0 THEN
    v_clean_code := upper(trim(p_invite_code));
    SELECT gi.id, g.nome, gi.email
    INTO v_invite_id, v_group_name, v_restricted_email
    FROM public.group_invites gi
    JOIN public.groups g ON g.id = gi.group_id
    WHERE upper(trim(gi.codigo)) = v_clean_code
      AND gi.usado_em IS NULL
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'needs_invite', v_has_groups,
    'invite_valid', (v_invite_id IS NOT NULL),
    'group_name', v_group_name,
    'restricted_email', v_restricted_email
  );
END;
$$;

-- 3.4. Cria o grupo, adiciona o usuário como admin, cria configurações e os 11 setores padrão
CREATE OR REPLACE FUNCTION public.create_group_with_defaults(
  p_nome text,
  p_fuso_horario text DEFAULT 'America/Cuiaba',
  p_nome_exibicao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_group_id uuid;
  v_new_group_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar conectado para criar um grupo.';
  END IF;

  -- Verifica se o usuário já faz parte de um grupo
  SELECT group_id INTO v_existing_group_id
  FROM public.group_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing_group_id IS NOT NULL THEN
    RETURN v_existing_group_id;
  END IF;

  IF char_length(trim(COALESCE(p_nome, ''))) = 0 THEN
    RAISE EXCEPTION 'Informe um nome válido para o grupo.';
  END IF;

  -- 1. Cria o grupo
  INSERT INTO public.groups (nome, fuso_horario)
  VALUES (
    trim(p_nome),
    COALESCE(NULLIF(trim(p_fuso_horario), ''), 'America/Cuiaba')
  )
  RETURNING id INTO v_new_group_id;

  -- 2. Vincula o criador como administrador do grupo
  INSERT INTO public.group_members (group_id, user_id, papel, nome_exibicao)
  VALUES (
    v_new_group_id,
    v_user_id,
    'admin',
    NULLIF(trim(COALESCE(p_nome_exibicao, '')), '')
  );

  -- 3. Cria as configurações padrão do grupo (média dos últimos 3 meses)
  INSERT INTO public.group_settings (group_id, metodo_preco, meses_media)
  VALUES (v_new_group_id, 'media', 3);

  -- 4. Cria os 11 setores padrão (Seção 5 do PROMPT.md)
  INSERT INTO public.sectors (group_id, nome, emoji, orcamento_mensal, ordem)
  VALUES
    (v_new_group_id, 'Hortifruti',           '🥬', NULL, 1),
    (v_new_group_id, 'Açougue e peixaria',   '🥩', NULL, 2),
    (v_new_group_id, 'Padaria',              '🍞', NULL, 3),
    (v_new_group_id, 'Laticínios e frios',   '🧀', NULL, 4),
    (v_new_group_id, 'Mercearia',            '🥫', NULL, 5),
    (v_new_group_id, 'Bebidas',              '🥤', NULL, 6),
    (v_new_group_id, 'Limpeza',              '🧽', NULL, 7),
    (v_new_group_id, 'Higiene e perfumaria', '🧴', NULL, 8),
    (v_new_group_id, 'Congelados',           '🧊', NULL, 9),
    (v_new_group_id, 'Pet',                  '🐾', NULL, 10),
    (v_new_group_id, 'Outros',               '🛒', NULL, 11);

  RETURN v_new_group_id;
END;
$$;

-- 3.4.1. Garante isolamento estrito: Visitante ganha seu próprio grupo demo e novos usuários ganham grupo próprio
CREATE OR REPLACE FUNCTION public.ensure_user_group(
  p_nome_exibicao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_group_id uuid;
  v_user_email text;
  v_demo_group_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar conectado para acessar o grupo.';
  END IF;

  -- Se o usuário já pertence a um grupo dele, retorna seu ID
  SELECT group_id INTO v_group_id
  FROM public.group_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    RETURN v_group_id;
  END IF;

  -- Se for o usuário Visitante (Recrutador/Demo): usa um grupo de demonstração EXCLUSIVO e isolado
  v_user_email := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
  IF v_user_email = 'visitante@pechincha.app' OR lower(COALESCE(p_nome_exibicao, '')) = 'visitante' THEN
    SELECT id INTO v_demo_group_id
    FROM public.groups
    WHERE nome = 'Demonstração (Visitante)'
    LIMIT 1;

    IF v_demo_group_id IS NOT NULL THEN
      INSERT INTO public.group_members (group_id, user_id, papel, nome_exibicao)
      VALUES (v_demo_group_id, v_user_id, 'membro', 'Visitante')
      ON CONFLICT (group_id, user_id) DO NOTHING;
      RETURN v_demo_group_id;
    END IF;

    RETURN public.create_group_with_defaults('Demonstração (Visitante)', 'America/Cuiaba', 'Visitante');
  END IF;

  -- Para QUALQUER OUTRO USUÁRIO: CRIA O SEU PRÓPRIO GRUPO NOVO!
  -- NUNCA adiciona em grupo existente de outros usuários!
  RETURN public.create_group_with_defaults('Nossa Casa', 'America/Cuiaba', p_nome_exibicao);
END;
$$;

-- 3.4.2. Permite ao administrador do grupo expulsar membros indesejados
CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  SELECT papel INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller_id;

  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Apenas o administrador do grupo pode remover membros.';
  END IF;

  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'O criador do grupo não pode ser removido.';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;

-- 3.5. Gera um novo código de convite para o grupo
CREATE OR REPLACE FUNCTION public.generate_group_invite(
  p_group_id uuid,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_codigo text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i integer;
  v_invite_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não pertence a este grupo.';
  END IF;

  -- Gera código de 8 caracteres fácil de ler (ex: PECH-4K9M)
  LOOP
    v_codigo := 'PECH-';
    FOR v_i IN 1..4 LOOP
      v_codigo := v_codigo || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.group_invites WHERE codigo = v_codigo);
  END LOOP;

  INSERT INTO public.group_invites (group_id, codigo, email, criado_por)
  VALUES (
    p_group_id,
    v_codigo,
    NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
    v_user_id
  )
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'id', v_invite_id,
    'codigo', v_codigo,
    'group_id', p_group_id,
    'email', NULLIF(lower(trim(COALESCE(p_email, ''))), '')
  );
END;
$$;

-- 3.6. Aceita um convite e vincula a segunda pessoa ao grupo
CREATE OR REPLACE FUNCTION public.accept_group_invite(
  p_codigo text,
  p_nome_exibicao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invite_id uuid;
  v_group_id uuid;
  v_invite_email text;
  v_usado_em timestamptz;
  v_group_name text;
  v_clean_code text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa fazer login ou criar sua conta antes de aceitar o convite.';
  END IF;

  v_clean_code := upper(trim(COALESCE(p_codigo, '')));
  IF char_length(v_clean_code) = 0 THEN
    RAISE EXCEPTION 'Informe um código de convite válido.';
  END IF;

  -- Busca e bloqueia a linha do convite para evitar uso simultâneo
  SELECT gi.id, gi.group_id, gi.email, gi.usado_em, g.nome
  INTO v_invite_id, v_group_id, v_invite_email, v_usado_em, v_group_name
  FROM public.group_invites gi
  JOIN public.groups g ON g.id = gi.group_id
  WHERE upper(trim(gi.codigo)) = v_clean_code
  FOR UPDATE OF gi;

  IF NOT FOUND OR v_invite_id IS NULL THEN
    RAISE EXCEPTION 'Código de convite não encontrado. Verifique se digitou corretamente.';
  END IF;

  IF v_usado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este convite já foi utilizado.';
  END IF;

  -- Se o convite foi restrito a um e-mail específico, confere o e-mail do usuário logado
  IF v_invite_email IS NOT NULL THEN
    v_user_email := lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
    IF v_user_email <> lower(trim(v_invite_email)) THEN
      RAISE EXCEPTION 'Este convite foi emitido exclusivamente para o e-mail %.', v_invite_email;
    END IF;
  END IF;

  -- Adiciona o usuário ao grupo (se já estiver no grupo, não duplica)
  INSERT INTO public.group_members (group_id, user_id, papel, nome_exibicao)
  VALUES (
    v_group_id,
    v_user_id,
    'membro',
    NULLIF(trim(COALESCE(p_nome_exibicao, '')), '')
  )
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Marca o convite como usado
  UPDATE public.group_invites
  SET usado_em = now(),
      usado_por = v_user_id
  WHERE id = v_invite_id;

  RETURN jsonb_build_object(
    'group_id', v_group_id,
    'group_name', v_group_name
  );
END;
$$;


-- ============================================================================
-- 4. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS) EM TODAS AS 12 TABELAS
-- ============================================================================

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups FORCE ROW LEVEL SECURITY;

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites FORCE ROW LEVEL SECURITY;

ALTER TABLE public.group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors FORCE ROW LEVEL SECURITY;

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.market_sector_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_sector_order FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.cart_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_payments FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- 5. POLÍTICAS RLS POR TABELA (ISOLAMENTO ESTRITO POR group_id)
-- ============================================================================

-- 5.1. Políticas para `groups`
-- Nota: Criação de grupos é feita exclusivamente via RPC `create_group_with_defaults`
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_group_member(id));

DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update" ON public.groups
  FOR UPDATE TO authenticated
  USING (public.is_group_member(id))
  WITH CHECK (public.is_group_member(id));

-- 5.2. Políticas para `group_members`
-- Nota: Inserção de membros é feita exclusivamente via RPCs `create_group_with_defaults` e `accept_group_invite`
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
CREATE POLICY "group_members_update" ON public.group_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_group_member(group_id))
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = public.group_members.group_id
        AND user_id = auth.uid()
        AND papel = 'admin'
    )
  );

-- 5.3. Políticas para `group_invites`
DROP POLICY IF EXISTS "group_invites_select" ON public.group_invites;
CREATE POLICY "group_invites_select" ON public.group_invites
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_invites_insert" ON public.group_invites;
CREATE POLICY "group_invites_insert" ON public.group_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_invites_delete" ON public.group_invites;
CREATE POLICY "group_invites_delete" ON public.group_invites
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id) AND usado_em IS NULL);

-- 5.4. Políticas para `group_settings`
DROP POLICY IF EXISTS "group_settings_select" ON public.group_settings;
CREATE POLICY "group_settings_select" ON public.group_settings
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_settings_insert" ON public.group_settings;
CREATE POLICY "group_settings_insert" ON public.group_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "group_settings_update" ON public.group_settings;
CREATE POLICY "group_settings_update" ON public.group_settings
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

-- 5.5. Políticas para `sectors`
DROP POLICY IF EXISTS "sectors_select" ON public.sectors;
CREATE POLICY "sectors_select" ON public.sectors
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "sectors_insert" ON public.sectors;
CREATE POLICY "sectors_insert" ON public.sectors
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "sectors_update" ON public.sectors;
CREATE POLICY "sectors_update" ON public.sectors
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "sectors_delete" ON public.sectors;
CREATE POLICY "sectors_delete" ON public.sectors
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.6. Políticas para `markets`
DROP POLICY IF EXISTS "markets_select" ON public.markets;
CREATE POLICY "markets_select" ON public.markets
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "markets_insert" ON public.markets;
CREATE POLICY "markets_insert" ON public.markets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "markets_update" ON public.markets;
CREATE POLICY "markets_update" ON public.markets
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "markets_delete" ON public.markets;
CREATE POLICY "markets_delete" ON public.markets
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.7. Políticas para `market_sector_order`
DROP POLICY IF EXISTS "market_sector_order_select" ON public.market_sector_order;
CREATE POLICY "market_sector_order_select" ON public.market_sector_order
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "market_sector_order_insert" ON public.market_sector_order;
CREATE POLICY "market_sector_order_insert" ON public.market_sector_order
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "market_sector_order_update" ON public.market_sector_order;
CREATE POLICY "market_sector_order_update" ON public.market_sector_order
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "market_sector_order_delete" ON public.market_sector_order;
CREATE POLICY "market_sector_order_delete" ON public.market_sector_order
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.8. Políticas para `products`
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.9. Políticas para `prices`
DROP POLICY IF EXISTS "prices_select" ON public.prices;
CREATE POLICY "prices_select" ON public.prices
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "prices_insert" ON public.prices;
CREATE POLICY "prices_insert" ON public.prices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "prices_update" ON public.prices;
CREATE POLICY "prices_update" ON public.prices
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "prices_delete" ON public.prices;
CREATE POLICY "prices_delete" ON public.prices
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.10. Políticas para `carts`
DROP POLICY IF EXISTS "carts_select" ON public.carts;
CREATE POLICY "carts_select" ON public.carts
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "carts_insert" ON public.carts;
CREATE POLICY "carts_insert" ON public.carts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "carts_update" ON public.carts;
CREATE POLICY "carts_update" ON public.carts
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "carts_delete" ON public.carts;
CREATE POLICY "carts_delete" ON public.carts
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.11. Políticas para `cart_items`
DROP POLICY IF EXISTS "cart_items_select" ON public.cart_items;
CREATE POLICY "cart_items_select" ON public.cart_items
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_items_insert" ON public.cart_items;
CREATE POLICY "cart_items_insert" ON public.cart_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_items_update" ON public.cart_items;
CREATE POLICY "cart_items_update" ON public.cart_items
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_items_delete" ON public.cart_items;
CREATE POLICY "cart_items_delete" ON public.cart_items
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));

-- 5.12. Políticas para `cart_payments`
DROP POLICY IF EXISTS "cart_payments_select" ON public.cart_payments;
CREATE POLICY "cart_payments_select" ON public.cart_payments
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_payments_insert" ON public.cart_payments;
CREATE POLICY "cart_payments_insert" ON public.cart_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_payments_update" ON public.cart_payments;
CREATE POLICY "cart_payments_update" ON public.cart_payments
  FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "cart_payments_delete" ON public.cart_payments;
CREATE POLICY "cart_payments_delete" ON public.cart_payments
  FOR DELETE TO authenticated
  USING (public.is_group_member(group_id));


-- ============================================================================
-- 6. PERMISSÕES DE EXECUÇÃO DE FUNÇÕES E SUPABASE REALTIME
-- ============================================================================

REVOKE ALL ON FUNCTION public.is_group_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_group_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_group_ids() TO authenticated;

REVOKE ALL ON FUNCTION public.check_registration_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_status(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_group_with_defaults(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_with_defaults(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.generate_group_invite(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_group_invite(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_group_invite(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(text, text) TO authenticated;

-- Habilita Realtime nas tabelas de sincronização ao vivo entre o casal
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'carts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.carts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cart_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
  END IF;
END
$$;
