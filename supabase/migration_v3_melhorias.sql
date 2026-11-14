-- ============================================================================
-- MIGRAÇÃO v3 — MELHORIAS PECHINCHA
-- 1) Configuração da IA por grupo em group_settings
-- 2) Suporte a itens avulsos em cart_items (product_id anulável + descrição + setor)
-- ============================================================================

-- 1. Adiciona colunas de IA em group_settings (compartilhada entre dispositivos e membros do grupo)
ALTER TABLE public.group_settings
  ADD COLUMN IF NOT EXISTS ia_ativada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ia_api_key text NULL,
  ADD COLUMN IF NOT EXISTS ia_modelo text NOT NULL DEFAULT 'gemini-3.8-flash';

-- 2. Permite itens avulsos sem produto cadastrado no catálogo em cart_items
ALTER TABLE public.cart_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS descricao_avulsa text NULL,
  ADD COLUMN IF NOT EXISTS sector_id_avulso uuid NULL REFERENCES public.sectors(id) ON DELETE SET NULL;

ALTER TABLE public.cart_items
  DROP CONSTRAINT IF EXISTS chk_cart_items_produto_ou_avulso;

ALTER TABLE public.cart_items
  ADD CONSTRAINT chk_cart_items_produto_ou_avulso CHECK (
    product_id IS NOT NULL OR char_length(trim(coalesce(descricao_avulsa, ''))) > 0
  );

-- 3. Atualiza trigger de integridade multi-tenant para validar itens normais e avulsos
CREATE OR REPLACE FUNCTION public.trg_sync_cart_items_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_group uuid;
  v_product_group uuid;
  v_sector_group uuid;
BEGIN
  SELECT group_id INTO v_cart_group FROM public.carts WHERE id = NEW.cart_id;
  IF v_cart_group IS NULL THEN
    RAISE EXCEPTION 'Carrinho inválido.';
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT group_id INTO v_product_group FROM public.products WHERE id = NEW.product_id;
    IF v_product_group IS NULL OR v_cart_group <> v_product_group THEN
      RAISE EXCEPTION 'Carrinho e produto devem pertencer ao mesmo grupo.';
    END IF;
  END IF;

  IF NEW.sector_id_avulso IS NOT NULL THEN
    SELECT group_id INTO v_sector_group FROM public.sectors WHERE id = NEW.sector_id_avulso;
    IF v_sector_group IS NULL OR v_cart_group <> v_sector_group THEN
      RAISE EXCEPTION 'Carrinho e setor avulso devem pertencer ao mesmo grupo.';
    END IF;
  END IF;

  NEW.group_id := v_cart_group;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- Atualiza o cache do PostgREST
NOTIFY pgrst, 'reload schema';
