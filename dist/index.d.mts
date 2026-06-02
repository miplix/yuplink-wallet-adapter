import { WalletModuleFactory, BrowserWallet } from '@near-wallet-selector/core';

interface SetupYupLinkOpts {
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
declare function setupYupLink(opts?: SetupYupLinkOpts): WalletModuleFactory<BrowserWallet>;

export { type SetupYupLinkOpts, setupYupLink };
