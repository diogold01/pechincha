-- Migration: Permite ao visitante converter sua conta demo em conta definitiva
CREATE OR REPLACE FUNCTION public.convert_guest_account(
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_group_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  -- Busca o grupo atual do visitante
  SELECT group_id INTO v_group_id
  FROM public.group_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    -- Renomeia o grupo de demonstração para Nossa Casa
    UPDATE public.groups
    SET nome = 'Nossa Casa'
    WHERE id = v_group_id AND nome = 'Demonstração (Visitante)';

    -- Atualiza o membro de visitante para o nome informado e define como admin da casa
    UPDATE public.group_members
    SET nome_exibicao = NULLIF(trim(p_new_name), ''), papel = 'admin'
    WHERE group_id = v_group_id AND user_id = v_user_id;
  END IF;
END;
$$;
