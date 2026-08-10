# Changelog

All notable changes to `@kraty/sdk` (Kraty TypeScript SDK) live here.
Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) +
[SemVer](https://semver.org/).

## [0.21.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.20.0...sdk-client-typescript-v0.21.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* **economy,engine:** derived progression, live inventory stream, and QA fixes ([e77fea7](https://github.com/PedroTrincheiras/Kraty/commit/e77fea74b8fe172eccbc65b59f886498488d289a))
* **economy,engine:** derived progression, live inventory stream, and QA fixes ([b65d4fe](https://github.com/PedroTrincheiras/Kraty/commit/b65d4fe2b3bdf3106d5ec15a32486321c405efbe))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **friends:** player social graph — friend codes, requests, presence, blocking ([4430123](https://github.com/PedroTrincheiras/Kraty/commit/4430123e34264b40910f538f32d431453d15a042))
* **friends:** social graph + matchmade-session score fix + Sessions tab ([f347a22](https://github.com/PedroTrincheiras/Kraty/commit/f347a220ec65fd38b5db7eed2b7dfb324405479d))
* **leaderboards:** per-player progression on board entries via ?progression= ([9b6fac7](https://github.com/PedroTrincheiras/Kraty/commit/9b6fac762e7c9295786058d8024d36811dcc2329))
* **leaderboards:** per-player progression on board entries via ?progression= ([e47bba6](https://github.com/PedroTrincheiras/Kraty/commit/e47bba6c13b2acbf58d742dde329fa4e998055f1))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* per-division bots & promotion, permissive inventory, and dashboard UX ([151e3bc](https://github.com/PedroTrincheiras/Kraty/commit/151e3bc43baabb614b5b31a29802225a30e754fc))
* per-division bots & promotion, permissive inventory, and dashboard UX ([5de7960](https://github.com/PedroTrincheiras/Kraty/commit/5de79605d73736fa4f3a03261024616b68a58294))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** free-form metadata + fetch-on-read Player envelope + SDK setMetadata/mergeMetadata ([5a6d1f9](https://github.com/PedroTrincheiras/Kraty/commit/5a6d1f94bbaaf69ef7d8b40012747c651538e8e8))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** players.setMetadata / mergeMetadata across TS, Unity, Flutter ([616a96a](https://github.com/PedroTrincheiras/Kraty/commit/616a96a2e91f57d4ce138a182108bb3f32453058))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))
* session-timer fixes, server clock, finalization standings enrichment ([d2aa1c8](https://github.com/PedroTrincheiras/Kraty/commit/d2aa1c8e74827dae1ff412d8e215b4559e5178cf))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **bots:** score bot schedules at FACE VALUE anchored to the session start ([d2aa1c8](https://github.com/PedroTrincheiras/Kraty/commit/d2aa1c8e74827dae1ff412d8e215b4559e5178cf))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))
* **sdk:** finalization result carries eventKey on the live SSE path ([aeb7772](https://github.com/PedroTrincheiras/Kraty/commit/aeb7772eb0c056dd07ac3f3c75b2013870466609))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump client-SDK install snippets + READMEs to v0.20.0 ([621efcf](https://github.com/PedroTrincheiras/Kraty/commit/621efcf4eb810dcc1f4542bd3a26b85eb3011b01))
* **sdks:** bump client-SDK install snippets + READMEs to v0.21.0 ([64328d5](https://github.com/PedroTrincheiras/Kraty/commit/64328d5fccf97ee873c87bf622acdf340d672565))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs for the v0.14.0 / v0.10.0 release ([87797b6](https://github.com/PedroTrincheiras/Kraty/commit/87797b602f0bbbdca10f8ca6d34b4309d51be06b))
* **sdks:** bump install snippets + READMEs for v0.15.0 / v0.11.0 release ([53ca1be](https://github.com/PedroTrincheiras/Kraty/commit/53ca1beae10f1fcab38c2c3c94c6b75aaad0757a))
* **sdks:** bump install snippets + READMEs for v0.16.0 / v0.12.0 release ([9bcb424](https://github.com/PedroTrincheiras/Kraty/commit/9bcb42492e71114205f58d9a193e6d17554abde7))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.20.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.19.0...sdk-client-typescript-v0.20.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* **economy,engine:** derived progression, live inventory stream, and QA fixes ([e77fea7](https://github.com/PedroTrincheiras/Kraty/commit/e77fea74b8fe172eccbc65b59f886498488d289a))
* **economy,engine:** derived progression, live inventory stream, and QA fixes ([b65d4fe](https://github.com/PedroTrincheiras/Kraty/commit/b65d4fe2b3bdf3106d5ec15a32486321c405efbe))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **friends:** player social graph — friend codes, requests, presence, blocking ([4430123](https://github.com/PedroTrincheiras/Kraty/commit/4430123e34264b40910f538f32d431453d15a042))
* **friends:** social graph + matchmade-session score fix + Sessions tab ([f347a22](https://github.com/PedroTrincheiras/Kraty/commit/f347a220ec65fd38b5db7eed2b7dfb324405479d))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* per-division bots & promotion, permissive inventory, and dashboard UX ([151e3bc](https://github.com/PedroTrincheiras/Kraty/commit/151e3bc43baabb614b5b31a29802225a30e754fc))
* per-division bots & promotion, permissive inventory, and dashboard UX ([5de7960](https://github.com/PedroTrincheiras/Kraty/commit/5de79605d73736fa4f3a03261024616b68a58294))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** free-form metadata + fetch-on-read Player envelope + SDK setMetadata/mergeMetadata ([5a6d1f9](https://github.com/PedroTrincheiras/Kraty/commit/5a6d1f94bbaaf69ef7d8b40012747c651538e8e8))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** players.setMetadata / mergeMetadata across TS, Unity, Flutter ([616a96a](https://github.com/PedroTrincheiras/Kraty/commit/616a96a2e91f57d4ce138a182108bb3f32453058))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))
* session-timer fixes, server clock, finalization standings enrichment ([d2aa1c8](https://github.com/PedroTrincheiras/Kraty/commit/d2aa1c8e74827dae1ff412d8e215b4559e5178cf))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **bots:** score bot schedules at FACE VALUE anchored to the session start ([d2aa1c8](https://github.com/PedroTrincheiras/Kraty/commit/d2aa1c8e74827dae1ff412d8e215b4559e5178cf))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))
* **sdk:** finalization result carries eventKey on the live SSE path ([aeb7772](https://github.com/PedroTrincheiras/Kraty/commit/aeb7772eb0c056dd07ac3f3c75b2013870466609))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump client-SDK install snippets + READMEs to v0.20.0 ([621efcf](https://github.com/PedroTrincheiras/Kraty/commit/621efcf4eb810dcc1f4542bd3a26b85eb3011b01))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs for the v0.14.0 / v0.10.0 release ([87797b6](https://github.com/PedroTrincheiras/Kraty/commit/87797b602f0bbbdca10f8ca6d34b4309d51be06b))
* **sdks:** bump install snippets + READMEs for v0.15.0 / v0.11.0 release ([53ca1be](https://github.com/PedroTrincheiras/Kraty/commit/53ca1beae10f1fcab38c2c3c94c6b75aaad0757a))
* **sdks:** bump install snippets + READMEs for v0.16.0 / v0.12.0 release ([9bcb424](https://github.com/PedroTrincheiras/Kraty/commit/9bcb42492e71114205f58d9a193e6d17554abde7))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.19.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.18.1...sdk-client-typescript-v0.19.0) (2026-08-05)


### Features

* **inventory:** `grants.grant()` — client-side self-grants for games in **permissive** inventory mode. The player-authenticated client grants items / currency / a crate to its OWN player (self only; enforced by the player secret). A game that isn't in permissive mode returns `403 inventory_not_permissive` (`err.isInventoryNotPermissive`). Permissive is platform-managed, so a reward grant auto-deposits and is readable from `inventory` / `wallet`.
* **leaderboards:** board-info reads now expose per-division promotion / relegation limits via the `progression` field (`ProgressionLimits`), so a client can show how many players promote out of — or drop from — the current division.

## [0.18.1](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.18.0...sdk-client-typescript-v0.18.1) (2026-07-24)


### Bug Fixes

* **sdk:** finalization result now carries `eventKey` (+ the canonical board ref) on the live SSE path, so `onFinalized` handlers can route on `result.eventKey`; previously only the catch-up path set it, so a stream-delivered result arrived without it.


## [0.18.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.17.0...sdk-client-typescript-v0.18.0) (2026-07-23)


### Features

* **sdk:** `FinalStanding` now carries `avatar` + `isSelf`; `onFinalized` reads the finalized board (live SSE + catch-up) so a result screen renders without a second fetch.
* **sdk:** server clock — `getServerTime()` plus `syncTime()` / `serverNow()` (monotonic-anchored), so game timers can't be spoofed by changing the device clock.


## [0.17.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.16.0...sdk-client-typescript-v0.17.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **friends:** player social graph — friend codes, requests, presence, blocking ([4430123](https://github.com/PedroTrincheiras/Kraty/commit/4430123e34264b40910f538f32d431453d15a042))
* **friends:** social graph + matchmade-session score fix + Sessions tab ([f347a22](https://github.com/PedroTrincheiras/Kraty/commit/f347a220ec65fd38b5db7eed2b7dfb324405479d))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** free-form metadata + fetch-on-read Player envelope + SDK setMetadata/mergeMetadata ([5a6d1f9](https://github.com/PedroTrincheiras/Kraty/commit/5a6d1f94bbaaf69ef7d8b40012747c651538e8e8))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** players.setMetadata / mergeMetadata across TS, Unity, Flutter ([616a96a](https://github.com/PedroTrincheiras/Kraty/commit/616a96a2e91f57d4ce138a182108bb3f32453058))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs for the v0.14.0 / v0.10.0 release ([87797b6](https://github.com/PedroTrincheiras/Kraty/commit/87797b602f0bbbdca10f8ca6d34b4309d51be06b))
* **sdks:** bump install snippets + READMEs for v0.15.0 / v0.11.0 release ([53ca1be](https://github.com/PedroTrincheiras/Kraty/commit/53ca1beae10f1fcab38c2c3c94c6b75aaad0757a))
* **sdks:** bump install snippets + READMEs for v0.16.0 / v0.12.0 release ([9bcb424](https://github.com/PedroTrincheiras/Kraty/commit/9bcb42492e71114205f58d9a193e6d17554abde7))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.16.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.15.0...sdk-client-typescript-v0.16.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** free-form metadata + fetch-on-read Player envelope + SDK setMetadata/mergeMetadata ([5a6d1f9](https://github.com/PedroTrincheiras/Kraty/commit/5a6d1f94bbaaf69ef7d8b40012747c651538e8e8))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** players.setMetadata / mergeMetadata across TS, Unity, Flutter ([616a96a](https://github.com/PedroTrincheiras/Kraty/commit/616a96a2e91f57d4ce138a182108bb3f32453058))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs for the v0.14.0 / v0.10.0 release ([87797b6](https://github.com/PedroTrincheiras/Kraty/commit/87797b602f0bbbdca10f8ca6d34b4309d51be06b))
* **sdks:** bump install snippets + READMEs for v0.15.0 / v0.11.0 release ([53ca1be](https://github.com/PedroTrincheiras/Kraty/commit/53ca1beae10f1fcab38c2c3c94c6b75aaad0757a))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.15.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.14.0...sdk-client-typescript-v0.15.0) (2026-07-16)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** free-form metadata + fetch-on-read Player envelope + SDK setMetadata/mergeMetadata ([5a6d1f9](https://github.com/PedroTrincheiras/Kraty/commit/5a6d1f94bbaaf69ef7d8b40012747c651538e8e8))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** players.setMetadata / mergeMetadata across TS, Unity, Flutter ([616a96a](https://github.com/PedroTrincheiras/Kraty/commit/616a96a2e91f57d4ce138a182108bb3f32453058))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs for the v0.14.0 / v0.10.0 release ([87797b6](https://github.com/PedroTrincheiras/Kraty/commit/87797b602f0bbbdca10f8ca6d34b4309d51be06b))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.14.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.13.0...sdk-client-typescript-v0.14.0) (2026-07-16)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs for the v0.13.0 / v0.9.0 release ([79ee827](https://github.com/PedroTrincheiras/Kraty/commit/79ee8271b43a8b5d299bcb94aa91ccea21459820))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.13.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.12.0...sdk-client-typescript-v0.13.0) (2026-07-16)


### ⚠ BREAKING CHANGES

* **players:** the shape of the setIdentity route responses (SDK, server, admin) is now `{displayIdentity, anonymizedIdentity}` in place of the previous single `syntheticIdentity` field. Callers reading `response.data.syntheticIdentity` must switch to `response.data.displayIdentity` (for the real display value) or `response.data.anonymizedIdentity` (for the pool value).
* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))
* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))
* **players:** split real vs synthetic identity + retroactive rename fan-out ([316ced8](https://github.com/PedroTrincheiras/Kraty/commit/316ced879f67df1cda71ad1d81bdc8ef2d91742b))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump client SDK install snippets + READMEs to v0.12.0 ([7e43418](https://github.com/PedroTrincheiras/Kraty/commit/7e434183903a14d18ebc04b0dfecbe39caace10a))
* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.12.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.11.0...sdk-client-typescript-v0.12.0) (2026-07-15)


### Features

* **players:** client-SDK self-service identity change ([d73e2b9](https://github.com/PedroTrincheiras/Kraty/commit/d73e2b95a4a4a17447bfb90fe2a950b1afb599e5))

## [0.11.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.10.0...sdk-client-typescript-v0.11.0) (2026-07-15)


### Features

* **leaderboards:** server-side country on join + country on entries/register (flags) ([666c505](https://github.com/PedroTrincheiras/Kraty/commit/666c5051211efef1de97b1917e43f78327959581))


### Documentation

* **sdks:** bump install snippets + READMEs for the v0.11.0 / v0.8.0 release ([8cafc26](https://github.com/PedroTrincheiras/Kraty/commit/8cafc26a6d7618c700b9177bedb6471d29efcfc7))
* **sdks:** bump install snippets + READMEs to match the release-please tag versions ([c66ffaf](https://github.com/PedroTrincheiras/Kraty/commit/c66ffaf27e1ac495957067003a411df8857a1c53))

## [0.10.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.9.0...sdk-client-typescript-v0.10.0) (2026-07-12)


### ⚠ BREAKING CHANGES

* **sdk:** the finalization MembershipKind wire/persisted values are now 'leaderboard' and 'event_leaderboard' (were 'shared_board' / 'event_board'). Client apps that persisted membership refs across an upgrade should clear them.
* **leaderboards:** the cross-event ("shared") leaderboard id in SDK/API responses is now `leaderboardId` (was `sharedLeaderboardId`). Physical DB tables were renamed; migration 0012 must run.
* **api:** API responses and SDK types now use `avatar` instead of `avatarUrl` for leaderboard entries and the player synthetic identity. Client code reading `entry.avatarUrl` or `syntheticIdentity.avatarUrl` must switch to `avatar`.
* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **api:** rename identity/leaderboard avatarUrl field to avatar ([76971be](https://github.com/PedroTrincheiras/Kraty/commit/76971be73e6313d8b54c1a947c1b82557885a702))
* finish an attempt now (player "end my run") across API + all SDKs ([f1ba2a0](https://github.com/PedroTrincheiras/Kraty/commit/f1ba2a0fa56a51a513bdbc865dd4ea9d854a8a65))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* **sdk:** surface synthetic identity + align progress verb across SDKs ([6e346f7](https://github.com/PedroTrincheiras/Kraty/commit/6e346f7328a3f58dd08d51f5f7d15c93e013aba6))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))


### Refactors

* **leaderboards:** rename shared leaderboards to "leaderboards", event boards to "event leaderboards" ([ec27f8e](https://github.com/PedroTrincheiras/Kraty/commit/ec27f8ecbc83c8381ec732e3540dbfc6099f99e5))
* **sdk:** rename finalization board kinds to leaderboard terminology ([cd1c007](https://github.com/PedroTrincheiras/Kraty/commit/cd1c007c2ba71b81de3ef64168bd7a847aab890d))

## [0.8.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.7.0...sdk-client-typescript-v0.8.0) (2026-07-09)


### ⚠ BREAKING CHANGES

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))

## [0.7.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.6.0...sdk-client-typescript-v0.7.0) (2026-07-06)


### ⚠ BREAKING CHANGES

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))
* session events — sudden-death sessions, convergence, promotion/relegation ([#5](https://github.com/PedroTrincheiras/Kraty/issues/5)) ([c3d698f](https://github.com/PedroTrincheiras/Kraty/commit/c3d698f8f73816a63a9ae799841d8d8eef3e1d4f))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))

## [0.6.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.5.0...sdk-client-typescript-v0.6.0) (2026-07-02)


### ⚠ BREAKING CHANGES

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **api:** leaderboard join + flexible multi-segment standings ([7a9f11f](https://github.com/PedroTrincheiras/Kraty/commit/7a9f11f2598fa6bed8c6036863172b666e1ebce4))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))
* **sdks:** bump SCHEMA.md to v0.6.0 + document join + standings ([ccb57c3](https://github.com/PedroTrincheiras/Kraty/commit/ccb57c38bb4954277cf86780b7afd172f889c21c))

## [0.5.0](https://github.com/PedroTrincheiras/Kraty/compare/sdk-client-typescript-v0.1.0...sdk-client-typescript-v0.5.0) (2026-06-29)


### ⚠ BREAKING CHANGES

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID)

### Features

* **api,sdks:** rename leaderboard URLs to match v0.4.0 client split ([53897ca](https://github.com/PedroTrincheiras/Kraty/commit/53897ca4cc245569dc86353de72fda3df8b925b9))
* **portal:** pool detail page + create-flow polish; release SDKs v0.3.0 ([cf7231d](https://github.com/PedroTrincheiras/Kraty/commit/cf7231d697bbb3485440c21f99578fd288ebf787))
* **sdks:** leaderboard submitScore (client TS/Unity/Flutter) + server scoring/progress ([02f4e69](https://github.com/PedroTrincheiras/Kraty/commit/02f4e6944813639ca19349ff1a9c28c92e6aa62f))
* **sdks:** split Leaderboards into Leaderboards (by key) + EventLeaderboards (by UUID) ([96116ac](https://github.com/PedroTrincheiras/Kraty/commit/96116acf7eb90ff32f2f5e9e7cf5617dc7610ec7))
* **sdk:** subscribe() helper + lazy-eval publishes bot deltas ([099d15d](https://github.com/PedroTrincheiras/Kraty/commit/099d15dc959c0619210319d343dc380c8b74c02d))


### Bug Fixes

* **backend:** lobby fill gap + bot kind TTL race + leaderboard isSelf flag ([4122793](https://github.com/PedroTrincheiras/Kraty/commit/4122793ee5ac02b10de88f74fea244dd2d6d650c))
* **ci:** repair all workflows after SDK restructure to client/server/ ([85f0524](https://github.com/PedroTrincheiras/Kraty/commit/85f0524ef1777240e04d96dd34dee3ec37ed7315))


### Documentation

* rewrite root README + point every SDK README at kraty.io/docs ([0bb9b13](https://github.com/PedroTrincheiras/Kraty/commit/0bb9b1385ef8803aaf2f67a3a63ea746ca4b6e12))
* **sdks:** bump SCHEMA.md headers to v0.4.1 + add wire-endpoint refs ([c2bc5eb](https://github.com/PedroTrincheiras/Kraty/commit/c2bc5eb24afecf61bb22cec0be9a234615a25877))

## [Unreleased]

### Added

- **`leaderboards.submitScore(key, value, opts?)`** — submit a score
  for the active player directly to a dashboard-configured board,
  outside an event attempt. Wraps
  `POST /sdk/v1/players/:externalId/leaderboards/:key/score`. Returns
  a new `LeaderboardScoreResult` (`{ leaderboardId, score, rank }`,
  where `rank` is `number | null`). `opts`:
  `{ segment?, idempotencyKey?, as? }`. Errors:
  `client_scoring_disabled` (403), `score_not_supported` (400),
  `not_found` (404), `validation_failed` (400).

### Changed

- `leaderboards.read` — `LeaderboardReadOptions.segment` is now
  required only for `context` segmentation. For
  `progression`-segmented boards omit it and the server derives the
  caller's division. Signature unchanged.
