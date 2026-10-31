import { createClient } from "@/lib/supabase/client";
import type {
  Cart,
  CartItem,
  Group,
  GroupSettings,
  Market,
  MarketSectorOrder,
  Price,
  Product,
  Sector,
} from "@/lib/types";

const DB_NAME = "pechincha_offline_db";
const DB_VERSION = 1;
const STORE_SNAPSHOT = "snapshots";
const STORE_QUEUE = "mutation_queue";

const LS_SNAPSHOT_KEY = "pechincha_snapshot_mercado_v1";
const LS_QUEUE_KEY = "pechincha_fila_offline_v1";

export interface SnapshotModoMercado {
  groupId: string;
  userId: string | null;
  grupo: Group | null;
  settings: GroupSettings | null;
  mercados: Market[];
  setores: Sector[];
  ordemSetoresMercado: MarketSectorOrder[];
  produtos: Product[];
  precos: Price[];
  carrinhosAtivos: Cart[];
  carrinhoAtualId: string | null;
  itensCarrinho: CartItem[];
  gastoMesPorSetorEntries: [string, number][];
  atualizadoEm: string;
}

export type TipoOperacaoOffline =
  | "UPDATE_CART_ITEM"
  | "INSERT_CART_ITEM"
  | "DELETE_CART_ITEM"
  | "UPSERT_PRICE_POR_ITEM"
  | "UPDATE_CART"
  | "UPDATE_PRODUCT"
  | "REORDER_SECTORS";

export interface OperacaoOffline {
  id: string;
  tipo: TipoOperacaoOffline;
  alvoId: string;
  dados: Record<string, unknown>;
  criadoEm: string;
}

function abrirBancoIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOT)) {
          db.createObjectStore(STORE_SNAPSHOT, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Salva o estado completo do carrinho ativo no aparelho (IndexedDB + localStorage)
 * para que o Modo Mercado continue abrindo e funcionando mesmo sem sinal.
 */
export async function salvarSnapshotModoMercado(
  snapshot: SnapshotModoMercado
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignora limite de quota do localStorage
  }

  const db = await abrirBancoIndexedDB();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_SNAPSHOT, "readwrite");
      tx.objectStore(STORE_SNAPSHOT).put({ key: "ativo", ...snapshot });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Lê o último estado salvo do carrinho no aparelho (IndexedDB ou localStorage).
 */
export async function lerSnapshotModoMercado(): Promise<SnapshotModoMercado | null> {
  if (typeof window === "undefined") return null;

  const db = await abrirBancoIndexedDB();
  if (db) {
    const idbRes = await new Promise<SnapshotModoMercado | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_SNAPSHOT, "readonly");
        const req = tx.objectStore(STORE_SNAPSHOT).get("ativo");
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result as SnapshotModoMercado);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (idbRes) return idbRes;
  }

  try {
    const raw = window.localStorage.getItem(LS_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SnapshotModoMercado;
  } catch {
    return null;
  }
}

/**
 * Lê a fila de operações pendentes de sincronização (localStorage + IndexedDB).
 */
export async function lerFilaOffline(): Promise<OperacaoOffline[]> {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LS_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OperacaoOffline[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Continua para IndexedDB
  }

  const db = await abrirBancoIndexedDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () =>
        resolve(((req.result as OperacaoOffline[]) || []).sort((a, b) =>
          a.criadoEm.localeCompare(b.criadoEm)
        ));
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function persistirFilaOffline(fila: OperacaoOffline[]): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(fila));
  } catch {
    // Ignora erro
  }

  const db = await abrirBancoIndexedDB();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      const store = tx.objectStore(STORE_QUEUE);
      store.clear();
      for (const op of fila) {
        store.put(op);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Adiciona uma operação à fila offline, mesclando alterações repetidas no mesmo item
 * (regra: vale a última alteração por item).
 */
export async function enfileirarOperacaoOffline(
  novaOp: Omit<OperacaoOffline, "id" | "criadoEm">
): Promise<number> {
  const fila = await lerFilaOffline();
  const agora = new Date().toISOString();

  if (novaOp.tipo === "UPDATE_CART_ITEM") {
    // Se já houver um UPDATE_CART_ITEM ou INSERT_CART_ITEM para o mesmo alvoId, mescla os dados
    const idxExistente = fila.findIndex(
      (op) =>
        (op.tipo === "UPDATE_CART_ITEM" || op.tipo === "INSERT_CART_ITEM") &&
        op.alvoId === novaOp.alvoId
    );
    if (idxExistente !== -1) {
      fila[idxExistente] = {
        ...fila[idxExistente],
        dados: { ...fila[idxExistente].dados, ...novaOp.dados },
        criadoEm: agora,
      };
      await persistirFilaOffline(fila);
      return fila.length;
    }
  } else if (novaOp.tipo === "DELETE_CART_ITEM") {
    // Remove operações anteriores pendentes para este item
    const filtrada = fila.filter((op) => op.alvoId !== novaOp.alvoId);
    // Se o item ainda era apenas local (temp-), não precisa enviar DELETE ao servidor
    if (novaOp.alvoId.startsWith("temp-")) {
      await persistirFilaOffline(filtrada);
      return filtrada.length;
    }
    filtrada.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...novaOp,
      criadoEm: agora,
    });
    await persistirFilaOffline(filtrada);
    return filtrada.length;
  } else if (novaOp.tipo === "UPSERT_PRICE_POR_ITEM") {
    const idxPreco = fila.findIndex(
      (op) =>
        op.tipo === "UPSERT_PRICE_POR_ITEM" && op.alvoId === novaOp.alvoId
    );
    if (idxPreco !== -1) {
      fila[idxPreco] = {
        ...fila[idxPreco],
        dados: { ...fila[idxPreco].dados, ...novaOp.dados },
        criadoEm: agora,
      };
      await persistirFilaOffline(fila);
      return fila.length;
    }
  } else if (novaOp.tipo === "UPDATE_PRODUCT") {
    const idxProd = fila.findIndex(
      (op) => op.tipo === "UPDATE_PRODUCT" && op.alvoId === novaOp.alvoId
    );
    if (idxProd !== -1) {
      fila[idxProd] = {
        ...fila[idxProd],
        dados: { ...fila[idxProd].dados, ...novaOp.dados },
        criadoEm: agora,
      };
      await persistirFilaOffline(fila);
      return fila.length;
    }
  }

  fila.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...novaOp,
    criadoEm: agora,
  });

  await persistirFilaOffline(fila);
  return fila.length;
}

/**
 * Processa todas as operações pendentes na fila offline assim que a internet voltar.
 */
export async function processarFilaOffline(): Promise<{
  sincronizadas: number;
  restantes: number;
}> {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    const filaAtual = await lerFilaOffline();
    return { sincronizadas: 0, restantes: filaAtual.length };
  }

  const fila = await lerFilaOffline();
  if (fila.length === 0) {
    return { sincronizadas: 0, restantes: 0 };
  }

  const supabase = createClient();
  const restantes: OperacaoOffline[] = [];
  let sincronizadas = 0;

  // Mapeia IDs temporários (temp-xxx) para os UUIDs definitivos gerados pelo banco no INSERT
  const mapaIdsTemporarios = new Map<string, string>();

  for (const op of fila) {
    try {
      const idResolvido = mapaIdsTemporarios.get(op.alvoId) || op.alvoId;

      if (op.tipo === "UPDATE_CART_ITEM") {
        if (idResolvido.startsWith("temp-")) {
          // Item temporário já mesclado ou sem INSERT correspondente
          sincronizadas++;
          continue;
        }
        const { error } = await supabase
          .from("cart_items")
          .update(op.dados)
          .eq("id", idResolvido);
        if (error) throw error;
        sincronizadas++;
      } else if (op.tipo === "INSERT_CART_ITEM") {
        const payload = { ...op.dados };
        delete payload.id;
        const { data: inserido, error } = await supabase
          .from("cart_items")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (inserido?.id && op.alvoId.startsWith("temp-")) {
          mapaIdsTemporarios.set(op.alvoId, inserido.id);
        }
        sincronizadas++;
      } else if (op.tipo === "DELETE_CART_ITEM") {
        if (idResolvido.startsWith("temp-")) {
          sincronizadas++;
          continue;
        }
        const { error } = await supabase
          .from("cart_items")
          .delete()
          .eq("id", idResolvido);
        if (error) throw error;
        sincronizadas++;
      } else if (op.tipo === "UPSERT_PRICE_POR_ITEM") {
        if (idResolvido.startsWith("temp-")) {
          sincronizadas++;
          continue;
        }
        const payloadPreco = { ...op.dados, cart_item_id: idResolvido };
        const { data: existente } = await supabase
          .from("prices")
          .select("id")
          .eq("cart_item_id", idResolvido)
          .maybeSingle();

        if (existente?.id) {
          const { error } = await supabase
            .from("prices")
            .update(payloadPreco)
            .eq("id", existente.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("prices").insert(payloadPreco);
          if (error) throw error;
        }
        sincronizadas++;
      } else if (op.tipo === "UPDATE_PRODUCT") {
        const { error } = await supabase
          .from("products")
          .update(op.dados)
          .eq("id", idResolvido);
        if (error) throw error;
        sincronizadas++;
      } else if (op.tipo === "UPDATE_CART") {
        const { error } = await supabase
          .from("carts")
          .update(op.dados)
          .eq("id", op.alvoId);
        if (error) throw error;
        sincronizadas++;
      } else if (op.tipo === "REORDER_SECTORS") {
        const marketId = op.alvoId;
        const groupId = op.dados.group_id as string;
        const ordens = op.dados.ordens as {
          group_id: string;
          market_id: string;
          sector_id: string;
          posicao: number;
        }[];
        await supabase
          .from("market_sector_order")
          .delete()
          .eq("group_id", groupId)
          .eq("market_id", marketId);
        const { error } = await supabase
          .from("market_sector_order")
          .insert(ordens);
        if (error) throw error;
        sincronizadas++;
      }
    } catch {
      restantes.push(op);
    }
  }

  await persistirFilaOffline(restantes);
  return { sincronizadas, restantes: restantes.length };
}
