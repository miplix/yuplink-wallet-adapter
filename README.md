# @miplix/yuplink-wallet-adapter

[NEAR wallet-selector](https://github.com/near/wallet-selector) adapter for **YupLink Wallet** — non-custodial NEAR wallet living at [service.yupland.io](https://service.yupland.io) and embedded in the YupLink Telegram Mini App.

> Redirect-based flow, MyNearWallet-style API. Drop-in для любого dApp'а, уже использующего `wallet-selector`.

## Install

Ставится прямо из GitHub — собранный `dist/` лежит в репо, в npm публиковать не нужно:

```bash
npm i github:miplix/yuplink-wallet-adapter @near-wallet-selector/core
# или pnpm/yarn — то же самое: github:miplix/yuplink-wallet-adapter
```

Запинить на конкретный коммит/тег:

```bash
npm i github:miplix/yuplink-wallet-adapter#v0.1.1
```

## Usage

```ts
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupYupLink } from "@miplix/yuplink-wallet-adapter";

const selector = await setupWalletSelector({
  network: "mainnet",
  modules: [
    setupYupLink({
      appName: "My dApp",
      iconUrl: "https://my.dapp/icon.png",
      // опционально:
      // walletUrl: "https://service.yupland.io", // для dev/staging
      // defaultAllowance: "250000000000000000000000", // 0.25 NEAR
    }),
    // ... другие кошельки
  ],
});
```

## How it works

| User action | Adapter does |
| --- | --- |
| `selector.wallet("yuplink-wallet").signIn(...)` | генерит ed25519 keypair → редирект на `/wallet/connect` с public_key + contract_id |
| approve в YupLink | мы делаем AddKey on-chain → redirect обратно с `account_id` |
| `wallet.signAndSendTransaction(...)` | сериализуем actions → редирект на `/wallet/sign` |
| `wallet.signMessage(...)` (NEP-413) | редирект на `/wallet/sign-message` |
| `wallet.signOut()` | очищаем local storage (для revoke ключа на цепочке — иди в `/wallet`) |

## Endpoints

Полная docs — [service.yupland.io/wallet/docs](https://service.yupland.io/wallet/docs).

## Security

- Юзер всегда видит approve UI на нашем домене.
- По умолчанию выдаётся **FCAK** (function-call access key), ограниченный твоим `contractId` + опц. `methodNames` + `allowance`. NEAR на балансе им не вывести.
- FullAccess выдаётся только если ты не передал `contractId` (юзер получит большое предупреждение).
- Юзер может отозвать любой подключённый dApp в `/wallet` → «Подключённые dApp'ы».

## License

MIT
