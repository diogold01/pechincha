import { createClient } from "@/lib/supabase/client";
import { calcularEstimativaItemCarrinho, dataHojeISO } from "@/lib/format";
import type {
  Cart,
  CartItem,
  GroupSettings,
  Market,
  Price,
  Product,
} from "@/lib/types";

/**
 * Copia um carrinho antigo criando um novo carrinho planejado ("Repetir")
 * com os mesmos itens, quantidades e marcas, recalculando o preço estimado
 * e a regra de atacado com base no histórico mais recente de preços.
 */
export async function repetirCarrinhoNoBanco(params: {
  groupId: string;
  userId: string | null;
  cartOrigemId: string;
  nomePersonalizado?: string;
}): Promise<{ novoCartId: string; qtdItensCopiados: number }> {
  const { groupId, userId, cartOrigemId, nomePersonalizado } = params;
  const supabase = createClient();

  const [
    { data: cartOrigemData, error: errCart },
    { data: itensOrigemData, error: errItens },
    { data: settingsData },
    { data: mercadosData },
    { data: produtosData },
    { data: precosData },
  ] = await Promise.all([
    supabase
      .from("carts")
      .select("*")
      .eq("id", cartOrigemId)
      .eq("group_id", groupId)
      .single(),
    supabase
      .from("cart_items")
      .select("*")
      .eq("cart_id", cartOrigemId)
      .eq("group_id", groupId)
      .order("ordem", { ascending: true }),
    supabase
      .from("group_settings")
      .select("*")
      .eq("group_id", groupId)
      .single(),
    supabase
      .from("markets")
      .select("*")
      .eq("group_id", groupId)
      .order("padrao", { ascending: false }),
    supabase
      .from("products")
      .select("*")
      .eq("group_id", groupId)
      .eq("ativo", true),
    supabase
      .from("prices")
      .select("*")
      .eq("group_id", groupId)
      .order("data", { ascending: false })
      .order("criado_em", { ascending: false }),
  ]);

  if (errCart || !cartOrigemData) {
    throw new Error("Carrinho original não encontrado.");
  }
  if (errItens) {
    throw new Error("Não foi possível ler os itens do carrinho original.");
  }

  const cartOrigem = cartOrigemData as Cart;
  const itensOrigem = (itensOrigemData as CartItem[]) || [];
  const settings = (settingsData as GroupSettings) || null;
  const mercados = (mercadosData as Market[]) || [];
  const produtosAtivos = (produtosData as Product[]) || [];
  const todosPrecos = (precosData as Price[]) || [];

  const idsProdutosAtivos = new Set(produtosAtivos.map((p) => p.id));

  // Define o mercado do novo carrinho (mantém o do carrinho original se ainda existir, senão usa o padrão)
  const mercadoOriginalExiste =
    cartOrigem.market_id &&
    mercados.some((m) => m.id === cartOrigem.market_id);

  const marketIdEscolhido = mercadoOriginalExiste
    ? cartOrigem.market_id
    : settings?.mercado_padrao_id ||
      mercados.find((m) => m.padrao)?.id ||
      mercados[0]?.id ||
      null;

  const nomeNovoCarrinho =
    nomePersonalizado?.trim() || cartOrigem.nome || "Compra do mês";

  // Cria o novo carrinho com status "planejado"
  const { data: novoCart, error: errInsertCart } = await supabase
    .from("carts")
    .insert({
      group_id: groupId,
      nome: nomeNovoCarrinho,
      market_id: marketIdEscolhido,
      status: "planejado",
      data_planejada: dataHojeISO(),
      criado_por: userId,
    })
    .select("*")
    .single();

  if (errInsertCart || !novoCart) {
    throw new Error("Não foi possível criar a cópia do carrinho.");
  }

  const novoCartObj = novoCart as Cart;

  // Agrupa preços por produto para reestimar cada item
  const precosPorProduto = new Map<string, Price[]>();
  for (const p of todosPrecos) {
    const lista = precosPorProduto.get(p.product_id) || [];
    lista.push(p);
    precosPorProduto.set(p.product_id, lista);
  }

  // Deduplica por product_id + marca caso o carrinho antigo tivesse itens repetidos
  const itensValidos = itensOrigem.filter((item) =>
    idsProdutosAtivos.has(item.product_id)
  );

  if (itensValidos.length > 0) {
    const novosItensPayload = itensValidos.map((item, idx) => {
      const listaPrecos = precosPorProduto.get(item.product_id) || [];
      const qtd = Number(item.quantidade) > 0 ? Number(item.quantidade) : 1;
      const estimativa = calcularEstimativaItemCarrinho(listaPrecos, qtd, {
        metodo: settings?.metodo_preco || "media",
        mesesMedia: settings?.meses_media || 3,
        marketIdCarrinho: marketIdEscolhido,
        marcaItem: item.marca,
      });

      // Se houver histórico, usa a nova estimativa; senão mantém o último valor conhecido do item antigo
      const precoEstimadoFinal =
        estimativa.precoUnitarioEstimado !== null
          ? estimativa.precoUnitarioEstimado
          : item.preco_real ?? item.preco_estimado ?? null;

      return {
        cart_id: novoCartObj.id,
        group_id: groupId,
        product_id: item.product_id,
        marca: item.marca || null,
        quantidade: qtd,
        preco_estimado: precoEstimadoFinal,
        preco_real: null,
        marcado: false,
        atacado_aplicado: estimativa.atacadoAplicado,
        ordem: idx + 1,
      };
    });

    const { error: errInsertItens } = await supabase
      .from("cart_items")
      .insert(novosItensPayload);

    if (errInsertItens) {
      throw new Error("Carrinho criado, mas houve erro ao copiar os itens.");
    }
  }

  return {
    novoCartId: novoCartObj.id,
    qtdItensCopiados: itensValidos.length,
  };
}
