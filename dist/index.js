"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  setupYupLink: () => setupYupLink
});
module.exports = __toCommonJS(index_exports);
var ed25519 = __toESM(require("@noble/ed25519"));
var import_base = require("@scure/base");
var DEFAULT_WALLET_URL = "https://service.yupland.io";
var STORAGE_PREFIX = "yuplink-wallet:";
var PENDING_KEY = `${STORAGE_PREFIX}pending-connect`;
var ACCOUNT_KEY = `${STORAGE_PREFIX}account-id`;
var PUBKEY_KEY = `${STORAGE_PREFIX}public-key`;
var PRIVKEY_KEY = `${STORAGE_PREFIX}private-key`;
function readLs(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writeLs(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
  }
}
function clearLs(k) {
  try {
    localStorage.removeItem(k);
  } catch {
  }
}
async function genKeypair() {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const publicKeyStr = `ed25519:${import_base.base58.encode(publicKey)}`;
  return { privateKey, publicKey, publicKeyStr };
}
function uint8ToBase64Url(u) {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function jsonToBase64Url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return uint8ToBase64Url(bytes);
}
var YupLink = async ({ params, emitter, logger }) => {
  void logger;
  const getCurrentAccount = () => {
    const accountId = readLs(ACCOUNT_KEY);
    const publicKey = readLs(PUBKEY_KEY);
    if (!accountId || !publicKey) return null;
    return { accountId, publicKey };
  };
  const tryCompleteSignIn = async () => {
    const pending = readLs(PENDING_KEY);
    if (!pending) return getCurrentAccount() ? [getCurrentAccount()] : [];
    const url = new URL(window.location.href);
    const accountId = url.searchParams.get("account_id");
    const publicKey = url.searchParams.get("public_key");
    if (!accountId || !publicKey) {
      return getCurrentAccount() ? [getCurrentAccount()] : [];
    }
    let p = null;
    try {
      p = JSON.parse(pending);
    } catch {
    }
    if (!p || p.publicKey !== publicKey) {
      clearLs(PENDING_KEY);
      return [];
    }
    writeLs(ACCOUNT_KEY, accountId);
    writeLs(PUBKEY_KEY, publicKey);
    writeLs(PRIVKEY_KEY, p.privateKey);
    clearLs(PENDING_KEY);
    const clean = new URL(window.location.href);
    [
      "account_id",
      "public_key",
      "all_keys",
      "transactionHashes",
      "errorCode",
      "errorMessage"
    ].forEach((p2) => clean.searchParams.delete(p2));
    window.history.replaceState({}, "", clean.toString());
    const acc = { accountId, publicKey };
    emitter.emit("signedIn", {
      contractId: "",
      methodNames: [],
      accounts: [acc]
    });
    return [acc];
  };
  void tryCompleteSignIn();
  return {
    async signIn({ contractId, methodNames, successUrl, failureUrl }) {
      const kp = await genKeypair();
      writeLs(
        PENDING_KEY,
        JSON.stringify({
          privateKey: uint8ToBase64Url(kp.privateKey),
          publicKey: kp.publicKeyStr
        })
      );
      const u = new URL(`${params.walletUrl}/wallet/connect`);
      u.searchParams.set(
        "success_url",
        successUrl || window.location.href
      );
      u.searchParams.set(
        "failure_url",
        failureUrl || window.location.href
      );
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
        "verifyOwner \u0443\u0441\u0442\u0430\u0440\u0435\u043B; \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 signMessage (NEP-413)"
      );
    },
    async signMessage({ message, nonce, recipient, callbackUrl, state }) {
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
      return void 0;
    },
    async signAndSendTransaction({ signerId, receiverId, actions, callbackUrl }) {
      const tx = {
        signerId: signerId || readLs(ACCOUNT_KEY) || "",
        receiverId: receiverId ?? "",
        actions
      };
      return signAndSendTxs(params, [tx], callbackUrl);
    },
    async signAndSendTransactions({ transactions, callbackUrl }) {
      const acc = readLs(ACCOUNT_KEY) || "";
      const normalized = transactions.map((t) => ({
        signerId: t.signerId ?? acc,
        receiverId: t.receiverId,
        actions: t.actions
      }));
      return signAndSendTxs(params, normalized, callbackUrl);
    }
  };
};
async function signAndSendTxs(params, txs, callbackUrl) {
  const payload = txs.map((t) => ({
    signerId: t.signerId,
    receiverId: t.receiverId,
    actions: t.actions.map((a) => normalizeAction(a))
  }));
  const u = new URL(`${params.walletUrl}/wallet/sign`);
  u.searchParams.set("transactions", jsonToBase64Url(payload));
  u.searchParams.set("callbackUrl", callbackUrl || window.location.href);
  window.location.assign(u.toString());
  return new Promise(() => {
  });
}
function normalizeAction(a) {
  if (a.type === "FunctionCall") {
    const p = a.params;
    return {
      type: "FunctionCall",
      params: {
        methodName: p.methodName,
        args: p.args,
        gas: String(p.gas),
        deposit: String(p.deposit)
      }
    };
  }
  if (a.type === "Transfer") {
    const p = a.params;
    return {
      type: "Transfer",
      params: { deposit: String(p.deposit) }
    };
  }
  throw new Error(
    `YupLink adapter: action "${a.type}" \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0430\u043D \u0432 redirect-flow`
  );
}
function setupYupLink(opts = {}) {
  return async () => {
    const params = {
      appName: opts.appName || "External dApp",
      iconUrl: opts.iconUrl || null,
      walletUrl: (opts.walletUrl || DEFAULT_WALLET_URL).replace(/\/$/, ""),
      defaultAllowance: opts.defaultAllowance || "250000000000000000000000"
      // 0.25 NEAR
    };
    return {
      id: opts.id || "yuplink-wallet",
      type: "browser",
      metadata: {
        name: "YupLink Wallet",
        description: "Non-custodial NEAR wallet by YupLink. Embedded \u0432 Telegram Mini App.",
        iconUrl: "https://service.yupland.io/wallet-icon.png",
        // fallback
        deprecated: false,
        available: true,
        successUrl: void 0,
        failureUrl: void 0,
        walletUrl: params.walletUrl
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      init: (config) => YupLink({ ...config, params })
    };
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  setupYupLink
});
