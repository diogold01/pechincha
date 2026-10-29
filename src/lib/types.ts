// ============================================================================
// TIPOS DO BANCO DE DADOS — PECHINCHA
// ============================================================================

export type PapelMembro = "admin" | "membro";
export type MetodoPreco = "media" | "ultimo" | "menor";
export type TipoPreco = "varejo" | "atacado";
export type StatusCarrinho = "planejado" | "em_compra" | "finalizado";
export type FormaPagamento =
  | "Dinheiro"
  | "Pix"
  | "Débito"
  | "Crédito"
  | "Vale-alimentação"
  | "Outro";

export interface Group {
  id: string;
  nome: string;
  fuso_horario: string;
  criado_em: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  papel: PapelMembro;
  nome_exibicao: string | null;
  criado_em: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  codigo: string;
  email: string | null;
  usado_em: string | null;
  usado_por: string | null;
  criado_por: string | null;
  criado_em: string;
}

export interface GroupSettings {
  group_id: string;
  metodo_preco: MetodoPreco;
  meses_media: number;
  mercado_padrao_id: string | null;
  atualizado_em: string;
}

export interface Sector {
  id: string;
  group_id: string;
  nome: string;
  emoji: string;
  orcamento_mensal: number | null;
  ordem: number;
  criado_em: string;
}

export interface Market {
  id: string;
  group_id: string;
  nome: string;
  padrao: boolean;
  criado_em: string;
}

export interface MarketSectorOrder {
  market_id: string;
  sector_id: string;
  group_id: string;
  posicao: number;
}

export interface Product {
  id: string;
  group_id: string;
  nome: string;
  sector_id: string | null;
  unidade: string;
  emoji: string | null;
  codigo_barras: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface Price {
  id: string;
  group_id: string;
  product_id: string;
  market_id: string;
  marca: string | null;
  valor: number;
  tipo: TipoPreco;
  quantidade_minima: number;
  data: string;
  criado_por: string | null;
  cart_item_id: string | null;
  criado_em: string;
}

export interface Cart {
  id: string;
  group_id: string;
  nome: string;
  market_id: string | null;
  status: StatusCarrinho;
  data_planejada: string;
  finalizado_em: string | null;
  criado_por: string | null;
  criado_em: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  group_id: string;
  product_id: string;
  marca: string | null;
  quantidade: number;
  preco_estimado: number | null;
  preco_real: number | null;
  marcado: boolean;
  atacado_aplicado: boolean;
  ordem: number;
  atualizado_em: string;
}

export interface CartPayment {
  id: string;
  cart_id: string;
  group_id: string;
  forma_pagamento: FormaPagamento;
  valor: number;
  criado_em: string;
}

export interface RegistrationStatus {
  needs_invite: boolean;
  invite_valid: boolean;
  group_name: string | null;
  restricted_email: string | null;
}
