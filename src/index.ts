// YupLink Wallet · Wallet-Selector Adapter.
//
// Browser-injected wallet, использующий redirect-flow на
// https://service.yupland.io/wallet/{connect,sign,sign-message}.
//
// Совместим с MyNearWallet-стилем — query params такие же.
//
// Usage:
//
//   import { setupWalletSelector } from "@near-wallet-selector/core";
//   import { setupYupLink } from "@miplix/yuplink-wallet-adapter";
//
//   const selector = await setupWalletSelector({
//     network: "mainnet",
//     modules: [
//       setupYupLink({
//         appName: "My dApp",
//         iconUrl: "https://my.dapp/icon.png",
//         // опц. override:
//         walletUrl: "https://service.yupland.io",
//       }),
//     ],
//   });

import * as ed25519 from "@noble/ed25519";
import { base58 } from "@scure/base";
import type {
  BrowserWallet,
  WalletModuleFactory,
  WalletBehaviourFactory,
  Account,
  Transaction,
  Action,
  FunctionCallAction,
  TransferAction,
} from "@near-wallet-selector/core";

const DEFAULT_WALLET_URL = "https://service.yupland.io";
const STORAGE_PREFIX = "yuplink-wallet:";
const PENDING_KEY = `${STORAGE_PREFIX}pending-connect`;
const ACCOUNT_KEY = `${STORAGE_PREFIX}account-id`;
const PUBKEY_KEY = `${STORAGE_PREFIX}public-key`;
const PRIVKEY_KEY = `${STORAGE_PREFIX}private-key`;

export interface SetupYupLinkOpts {
  /** Имя dApp'a, видимое юзеру в approve UI */
  appName?: string;
  /** Иконка dApp'a (URL) */
  iconUrl?: string;
  /** Override домена кошелька (для dev/staging) */
  walletUrl?: string;
  /** ID кошелька внутри selector'а — менять только если конфликт */
  id?: string;
  /** Глубокий лимит газа для FCAK в yocto. Дефолт 0.25 NEAR */
  defaultAllowance?: string;
  /**
   * Username Telegram-бота с подключённым Mini App (без @). Если задан —
   * используется relay-режим (HOT-style): запрос идёт на /api/wallet-relay,
   * юзер открывает t.me/<bot>?startapp=connect-<id> в своём Telegram,
   * результат возвращается поллингом. Без редиректа dApp'а.
   * По умолчанию — "yuplink_bot".
   */
  telegramBot?: string;
}

interface YupLinkParams {
  appName: string;
  iconUrl: string | null;
  walletUrl: string;
  defaultAllowance: string;
  telegramBot: string;
}

function readLs(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeLs(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
function clearLs(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}


async function genKeypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyStr: string;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const publicKeyStr = `ed25519:${base58.encode(publicKey)}`;
  return { privateKey, publicKey, publicKeyStr };
}

function uint8ToBase64Url(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jsonToBase64Url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return uint8ToBase64Url(bytes);
}

// ──────── Adapter behaviour ────────

const YupLink: WalletBehaviourFactory<BrowserWallet, { params: YupLinkParams }> =
  async ({ params, emitter, logger }) => {
    void logger;

    const getCurrentAccount = (): Account | null => {
      const accountId = readLs(ACCOUNT_KEY);
      const publicKey = readLs(PUBKEY_KEY);
      if (!accountId || !publicKey) return null;
      return { accountId, publicKey };
    };

    // При возврате с success_url — selector сам пробросит query
    // (мы парсим вручную для совместимости).
    const tryCompleteSignIn = async (): Promise<Account[]> => {
      const pending = readLs(PENDING_KEY);
      if (!pending) return getCurrentAccount() ? [getCurrentAccount()!] : [];
      const url = new URL(window.location.href);
      const accountId = url.searchParams.get("account_id");
      const publicKey = url.searchParams.get("public_key");
      if (!accountId || !publicKey) {
        // не наш редирект — оставляем как было
        return getCurrentAccount() ? [getCurrentAccount()!] : [];
      }
      // Извлекаем сохранённый privateKey (мы сгенерили при signIn)
      let p: { privateKey: string; publicKey: string } | null = null;
      try {
        p = JSON.parse(pending) as { privateKey: string; publicKey: string };
      } catch {
        /* ignore */
      }
      if (!p || p.publicKey !== publicKey) {
        clearLs(PENDING_KEY);
        return [];
      }
      writeLs(ACCOUNT_KEY, accountId);
      writeLs(PUBKEY_KEY, publicKey);
      writeLs(PRIVKEY_KEY, p.privateKey);
      clearLs(PENDING_KEY);

      // Чистим query (account_id/public_key/all_keys/transactionHashes)
      const clean = new URL(window.location.href);
      [
        "account_id",
        "public_key",
        "all_keys",
        "transactionHashes",
        "errorCode",
        "errorMessage",
      ].forEach((p) => clean.searchParams.delete(p));
      window.history.replaceState({}, "", clean.toString());

      const acc = { accountId, publicKey };
      emitter.emit("signedIn", {
        contractId: "",
        methodNames: [],
        accounts: [acc],
      });
      return [acc];
    };

    // На загрузку — попытка завершить sign-in (если вернулись с редиректа)
    void tryCompleteSignIn();

    return {
      async signIn({ contractId, methodNames, successUrl, failureUrl }) {
        const kp = await genKeypair();
        // Сохраняем privateKey локально, чтобы потом подписывать tx FCAK'ом
        writeLs(
          PRIVKEY_KEY,
          uint8ToBase64Url(kp.privateKey)
        );
        writeLs(PUBKEY_KEY, kp.publicKeyStr);
        writeLs(
          PENDING_KEY,
          JSON.stringify({
            privateKey: uint8ToBase64Url(kp.privateKey),
            publicKey: kp.publicKeyStr,
          })
        );

        // ───── Relay-режим: создаём запрос на сервере, открываем
        // t.me/<bot>?startapp=connect-<id> у юзера, поллим ответ.
        // dApp при этом ОСТАЁТСЯ на текущей странице — никакого редиректа.
        try {
          const createRes = await fetch(`${params.walletUrl}/api/wallet-relay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              publicKey: kp.publicKeyStr,
              contractId: contractId ?? null,
              methods: methodNames ?? [],
              allowanceYocto: params.defaultAllowance,
              appName: params.appName,
              appIcon: params.iconUrl,
              successUrl: successUrl ?? null,
            }),
          });
          if (createRes.ok) {
            const { requestId } = (await createRes.json()) as {
              requestId: string;
            };
            const tgLink = `https://t.me/${params.telegramBot}/app?startapp=connect-${requestId}`;
            try {
              window.open(tgLink, "_blank", "noopener,noreferrer");
            } catch {
              window.location.assign(tgLink);
            }

            // Поллим ответ. Таймаут 10 мин (как TTL у relay).
            const deadline = Date.now() + 10 * 60 * 1000;
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 1500));
              try {
                const pollRes = await fetch(
                  `${params.walletUrl}/api/wallet-relay`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "poll", id: requestId }),
                  }
                );
                if (!pollRes.ok) continue;
                const d = (await pollRes.json()) as {
                  status: string;
                  response?: {
                    accountId: string;
                    publicKey: string;
                    transactionHashes: string;
                  } | null;
                };
                if (d.status === "approved" && d.response) {
                  writeLs(ACCOUNT_KEY, d.response.accountId);
                  writeLs(PUBKEY_KEY, d.response.publicKey);
                  clearLs(PENDING_KEY);
                  const acc = {
                    accountId: d.response.accountId,
                    publicKey: d.response.publicKey,
                  };
                  emitter.emit("signedIn", {
                    contractId: contractId ?? "",
                    methodNames: methodNames ?? [],
                    accounts: [acc],
                  });
                  return [acc];
                }
                if (d.status === "rejected") {
                  clearLs(PENDING_KEY);
                  throw new Error("Пользователь отклонил подключение");
                }
                if (d.status === "expired" || d.status === "not_found") {
                  clearLs(PENDING_KEY);
                  throw new Error("Запрос истёк, попробуй ещё раз");
                }
                // status === "pending" → продолжаем поллинг
              } catch {
                /* сетевая ошибка — продолжаем поллинг */
              }
            }
            clearLs(PENDING_KEY);
            throw new Error("Таймаут подключения (10 мин)");
          }
          // Если relay-сервер не ответил → падаем в legacy redirect-флоу.
        } catch {
          /* fall through to redirect */
        }

        // ───── Legacy: classic MyNearWallet redirect (fallback) ─────
        const u = new URL(`${params.walletUrl}/wallet/connect`);
        u.searchParams.set("success_url", successUrl || window.location.href);
        u.searchParams.set("failure_url", failureUrl || window.location.href);
        u.searchParams.set("public_key", kp.publicKeyStr);
        if (contractId) u.searchParams.set("contract_id", contractId);
        if (methodNames && methodNames.length > 0) {
          u.searchParams.set("methods", methodNames.join(","));
        }
        u.searchParams.set("allowance", params.defaultAllowance);
        u.searchParams.set("app_name", params.appName);
        if (params.iconUrl) u.searchParams.set("app_icon", params.iconUrl);
        window.location.assign(u.toString());
        return [];
      },

      async signOut() {
        clearLs(ACCOUNT_KEY);
        clearLs(PUBKEY_KEY);
        clearLs(PRIVKEY_KEY);
        clearLs(PENDING_KEY);
      },

      async getAccounts() {
        const a = getCurrentAccount();
        return a ? [a] : [];
      },

      async verifyOwner() {
        throw new Error(
          "verifyOwner устарел; используй signMessage (NEP-413)"
        );
      },

      async signMessage({ message, nonce, recipient, callbackUrl, state }) {
        // NEP-413 redirect-flow. Возврат через callbackUrl с query.
        const u = new URL(`${params.walletUrl}/wallet/sign-message`);
        u.searchParams.set("message", message);
        u.searchParams.set("recipient", recipient);
        u.searchParams.set("nonce", uint8ToBase64Url(new Uint8Array(nonce)));
        u.searchParams.set(
          "callbackUrl",
          callbackUrl || window.location.href
        );
        if (state) u.searchParams.set("state", state);
        window.location.assign(u.toString());
        // Не вернёмся — браузер уйдёт по редиректу. Тип требует Promise.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return undefined as any;
      },

      async signAndSendTransaction({ signerId, receiverId, actions, callbackUrl }) {
        const tx: Transaction = {
          signerId: signerId || readLs(ACCOUNT_KEY) || "",
          receiverId: receiverId ?? "",
          actions,
        };
        return signAndSendTxs(params, [tx], callbackUrl);
      },

      async signAndSendTransactions({ transactions, callbackUrl }) {
        const acc = readLs(ACCOUNT_KEY) || "";
        const normalized: Transaction[] = transactions.map((t) => ({
          signerId: t.signerId ?? acc,
          receiverId: t.receiverId,
          actions: t.actions,
        }));
        return signAndSendTxs(params, normalized, callbackUrl);
      },
    };
  };

async function signAndSendTxs(
  params: YupLinkParams,
  txs: Transaction[],
  callbackUrl?: string
): Promise<never> {
  const payload = txs.map((t) => ({
    signerId: t.signerId,
    receiverId: t.receiverId,
    actions: t.actions.map((a: Action) => normalizeAction(a)),
  }));
  const u = new URL(`${params.walletUrl}/wallet/sign`);
  u.searchParams.set("transactions", jsonToBase64Url(payload));
  u.searchParams.set("callbackUrl", callbackUrl || window.location.href);
  window.location.assign(u.toString());
  return new Promise<never>(() => {
    /* never resolves — браузер уйдёт по редиректу */
  });
}

function normalizeAction(a: Action) {
  if (a.type === "FunctionCall") {
    const p = (a as FunctionCallAction).params;
    return {
      type: "FunctionCall",
      params: {
        methodName: p.methodName,
        args: p.args,
        gas: String(p.gas),
        deposit: String(p.deposit),
      },
    };
  }
  if (a.type === "Transfer") {
    const p = (a as TransferAction).params;
    return {
      type: "Transfer",
      params: { deposit: String(p.deposit) },
    };
  }
  throw new Error(
    `YupLink adapter: action "${a.type}" пока не поддержан в redirect-flow`
  );
}

export function setupYupLink(
  opts: SetupYupLinkOpts = {}
): WalletModuleFactory<BrowserWallet> {
  return async () => {
    const params: YupLinkParams = {
      appName: opts.appName || "External dApp",
      iconUrl: opts.iconUrl || null,
      walletUrl: (opts.walletUrl || DEFAULT_WALLET_URL).replace(/\/$/, ""),
      defaultAllowance:
        opts.defaultAllowance || "250000000000000000000000", // 0.25 NEAR
      telegramBot: (opts.telegramBot ?? "yuplink_bot").replace(/^@/, ""),
    };
    return {
      id: opts.id || "yuplink-wallet",
      type: "browser",
      metadata: {
        name: "YupLink Wallet",
        description:
          "Non-custodial NEAR wallet by YupLink. Embedded в Telegram Mini App.",
        iconUrl:
          "https://service.yupland.io/wallet-icon.png", // fallback
        deprecated: false,
        available: true,
        successUrl: undefined,
        failureUrl: undefined,
        walletUrl: params.walletUrl,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      init: (config: any) => YupLink({ ...config, params }) as any,
    };
  };
}
