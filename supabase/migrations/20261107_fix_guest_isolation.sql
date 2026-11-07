-- ============================================================================
-- CORREÇÃO CRÍTICA DE PRIVACIDADE E ISOLAMENTO DE GRUPOS
-- 1. Remove Visitante e usuários não autorizados do grupo pessoal do Diogo
-- 2. Garante que Visitante tenha seu próprio grupo isolado de demonstração
-- 3. Garante que novos usuários NUNCA entrem no grupo de outra pessoa
-- 4. Permite ao administrador do grupo remover membros diretamente
-- ============================================================================

-- 1. Remove membros estranhos (Visitante, Dioge, etc.) do grupo original do Diogo
DELETE FROM public.group_members
WHERE group_id = (SELECT id FROM public.groups WHERE nome = 'Nossa Casa' ORDER BY criado_em ASC LIMIT 1)
  AND (
    nome_exibicao ILIKE '%visitante%' 
    OR nome_exibicao ILIKE '%dioge%'
    OR user_id IN (
      SELECT id FROM auth.users WHERE email = 'visitante@pechincha.app'
    )
  );

-- 2. Corrige a função ensure_user_group: NUNCA MAIS coloca ninguém no grupo de terceiros!
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

  -- Se o usuário já pertence a um grupo dele, retorna o grupo dele
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
    -- Procura o grupo isolado de demonstração
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

    -- Se não existir o grupo de demonstração, cria ele exclusivamente para os visitantes
    RETURN public.create_group_with_defaults('Demonstração (Visitante)', 'America/Cuiaba', 'Visitante');
  END IF;

  -- Para QUALQUER OUTRO USUÁRIO: CRIA O SEU PRÓPRIO GRUPO NOVO!
  -- NUNCA adiciona em grupo existente de outros usuários!
  RETURN public.create_group_with_defaults('Nossa Casa', 'America/Cuiaba', p_nome_exibicao);
END;
$$;

-- 3. Função segura para o Administrador do grupo poder expulsar membros indesejados
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

  -- Verifica se quem chamou é admin do grupo
  SELECT papel INTO v_caller_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_caller_id;

  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Apenas o administrador do grupo pode remover membros.';
  END IF;

  -- Não permite remover o próprio criador admin
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'O criador do grupo não pode ser removido.';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;

-- 4. Habilita política de deleção de membros para o admin
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
