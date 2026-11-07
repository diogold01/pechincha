-- Migration: Garantir acesso direto sem bloqueio de grupo
-- Permite que recrutadores e novos usuários entrem direto no aplicativo

-- 1. Cria a função ensure_user_group que vincula o usuário diretamente ao grupo existente
-- ou cria o primeiro grupo automaticamente, sem exigir telas de onboarding ou convites.
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar conectado para acessar o grupo.';
  END IF;

  -- Se o usuário já pertence a um grupo, retorna seu ID
  SELECT group_id INTO v_group_id
  FROM public.group_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    RETURN v_group_id;
  END IF;

  -- Se já existir um grupo configurado (ex: o grupo demo com os dados do app),
  -- vincula o usuário automaticamente como membro para ele entrar direto!
  SELECT id INTO v_group_id
  FROM public.groups
  ORDER BY criado_em ASC
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    INSERT INTO public.group_members (group_id, user_id, papel, nome_exibicao)
    VALUES (
      v_group_id,
      v_user_id,
      'membro',
      NULLIF(trim(COALESCE(p_nome_exibicao, '')), '')
    )
    ON CONFLICT (group_id, user_id) DO NOTHING;

    RETURN v_group_id;
  END IF;

  -- Se for a primeiríssima instalação do banco e não existir nenhum grupo, cria o grupo padrão
  RETURN public.create_group_with_defaults('Nossa Casa', 'America/Cuiaba', p_nome_exibicao);
END;
$$;

-- 2. Removemos a trava v_any_group_exists da função create_group_with_defaults
-- para que criar novos grupos nunca seja barrado com erro vermelho
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

  -- Se o usuário já faz parte de um grupo, retorna o ID dele
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

  -- Cria o grupo
  INSERT INTO public.groups (nome, fuso_horario)
  VALUES (
    trim(p_nome),
    COALESCE(NULLIF(trim(p_fuso_horario), ''), 'America/Cuiaba')
  )
  RETURNING id INTO v_new_group_id;

  -- Vincula o criador como administrador do grupo
  INSERT INTO public.group_members (group_id, user_id, papel, nome_exibicao)
  VALUES (
    v_new_group_id,
    v_user_id,
    'admin',
    NULLIF(trim(COALESCE(p_nome_exibicao, '')), '')
  );

  -- Cria as configurações padrão do grupo
  INSERT INTO public.group_settings (group_id, metodo_preco, meses_media)
  VALUES (v_new_group_id, 'media', 3);

  -- Cria os 11 setores padrão
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
