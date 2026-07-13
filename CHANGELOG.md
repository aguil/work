# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries from the next release onward are updated by
[release-please](https://github.com/googleapis/release-please) when the release
PR merges. See [CONTRIBUTING.md](./CONTRIBUTING.md#releasing).

## [0.1.5](https://github.com/aguil/work/compare/v0.1.4...v0.1.5) (2026-07-13)


### Fixed

* **workspace:** encode workspace state filenames ([747fc38](https://github.com/aguil/work/commit/747fc383c26c136e8657547621ca6743f51c0d64))
* **workspace:** encode workspace state filenames ([00a49af](https://github.com/aguil/work/commit/00a49af548ca628aac4f32c8a28f75e77fcaf168))
* **workspace:** harden legacy workspace migration paths ([bca3dc2](https://github.com/aguil/work/commit/bca3dc20a61bed57ddcc48f60d38e647660f82d8))
* **workspace:** migrate legacy workspace state filenames ([769d8a4](https://github.com/aguil/work/commit/769d8a41875a4d74aae7ba81bf4d3ecbcd2d4a57))
* **workspace:** resolve symlinks before legacy state cleanup ([4b79c3e](https://github.com/aguil/work/commit/4b79c3eb921655930dba18c2d9642bfd3483c0dc))

## [0.1.4](https://github.com/aguil/work/compare/v0.1.3...v0.1.4) (2026-07-12)


### Fixed

* **release:** pass repository to gh workflow run ([2f81da4](https://github.com/aguil/work/commit/2f81da4dd6cc9282ad7726abc87ceaacbdc48b8b))
* **release:** pass repository to gh workflow run ([8f2f94a](https://github.com/aguil/work/commit/8f2f94ac2f87054921ec47bf5bd13b4526bc5ea7))

## [0.1.3](https://github.com/aguil/work/compare/v0.1.2...v0.1.3) (2026-07-12)


### Fixed

* **release:** dispatch npm publish after release-please ([a1fd7a6](https://github.com/aguil/work/commit/a1fd7a6efce3d177743e064fcfb01b53de665778))
* **release:** dispatch npm publish after release-please ([6fea373](https://github.com/aguil/work/commit/6fea3735623b51763ec7e101e658a35c4747d7b9))

## [0.1.2](https://github.com/aguil/work/compare/v0.1.1...v0.1.2) (2026-07-12)


### Added

* add agent launch and relaunch commands ([3ac548c](https://github.com/aguil/work/commit/3ac548c6e7d1b683ea70ccb07511eb0b075e9df2))
* add Claude Code status manifest for Tier 2 observation ([53bc358](https://github.com/aguil/work/commit/53bc358c68835a88bce76efbd85aa89cbf407f0c))
* add git and jj VCS detection ([47712a6](https://github.com/aguil/work/commit/47712a685611aaf4b5149a9d2dac89a80a56c91f))
* add hooks install claude command ([b2a3cf0](https://github.com/aguil/work/commit/b2a3cf012dbcbf83274c3b8af58f6f65f66cd3a3))
* add interactive workspace creation (workctl new/close) ([96f11aa](https://github.com/aguil/work/commit/96f11aa2bff07475deac68b57787893caaa0bd07))
* add optional herdr-backed Tier 2 detection backend ([0569f3f](https://github.com/aguil/work/commit/0569f3f6682ba90657b51b121b5cbd7277974588))
* add Phase 1 CLI commands ([1239897](https://github.com/aguil/work/commit/1239897ccd9bb587a2c96675dd5dc452d6903f7e))
* add Phase 4 actions, repos, and picker config ([28b6f48](https://github.com/aguil/work/commit/28b6f4823f499a41ab0f76733365a7d1c52af478))
* add sidebar TUI ([64340c9](https://github.com/aguil/work/commit/64340c9d3acb7fb0fbdbdc9b8192ef8242210b92))
* add tmux client and config modules ([a19296a](https://github.com/aguil/work/commit/a19296a4d2a259951fa984c91486a97bead83dc5))
* add tree management commands ([732ed22](https://github.com/aguil/work/commit/732ed227f02430a51b971b9e3b77c71704fde93e))
* add workctld daemon and IPC ([92690bf](https://github.com/aguil/work/commit/92690bf437f1e7b0a4b77ff0eba3dbdfedd2c739))
* add workspace state and agent scanner ([18a523c](https://github.com/aguil/work/commit/18a523ceb77392d368261b9f558ed60d14056b5f))
* add-tree --open flag ([54b7d5d](https://github.com/aguil/work/commit/54b7d5d94db0ebd28029d88ca5b1d6cf44620367))
* cache herdr explain results by pane screen hash ([2e34a2d](https://github.com/aguil/work/commit/2e34a2d25f006cc9d22ecd20930bbf0b6fe7923c))
* cache herdr verdicts and extend scanner detection ([bbd07f2](https://github.com/aguil/work/commit/bbd07f24356b38fb965cf626ea00fa98c2c8398d))
* Claude Code hooks and harden agent tracking ([66995b5](https://github.com/aguil/work/commit/66995b59b17809863f645483d748f9db906f8e86))
* **config:** add session-shortcut-index setting ([4e0a8b4](https://github.com/aguil/work/commit/4e0a8b41303a364b1cfbd35d06896d9295123c72))
* **config:** add session-shortcut-keys setting ([c42a67b](https://github.com/aguil/work/commit/c42a67b12ecededcd86377b755bfda4808dbe6d3))
* configurable session shortcut keys for sidebar ([4002c9b](https://github.com/aguil/work/commit/4002c9b8d6c0888ceb171d8c1f75e64471c3ec6c))
* create project checkout on window use-repo ([268feb6](https://github.com/aguil/work/commit/268feb6de20a21733d3f98fd3a5c4f93ff355d8d))
* Cursor hooks Tier 1 status via agent hook-event ([18af894](https://github.com/aguil/work/commit/18af89492f478938ee0abd939765c71f38bdfe51))
* **daemon:** enrich agent and tree snapshots for sidebar ([a404875](https://github.com/aguil/work/commit/a404875bad6b644ee64945534facd891cd5eebc7))
* extract shared agent display rules for sidebar ([7ee8dde](https://github.com/aguil/work/commit/7ee8ddee2e936e432f84d281d990815d5189f83b))
* generalize hook events for Claude Code PascalCase ([8ad30ec](https://github.com/aguil/work/commit/8ad30ec59c10e9e9df009e51027060cfbe22da9e))
* multi repo-scan-dir and remove dead picker config ([dda6dd1](https://github.com/aguil/work/commit/dda6dd1455e65e22bb0496552a2c2b1e1991f185))
* optional herdr-backed Tier 2 agent detection ([a5454b4](https://github.com/aguil/work/commit/a5454b4be993038dd007adbdefcd5022dc0192fd))
* remove-tree checkout cleanup with removal warnings ([8599dc6](https://github.com/aguil/work/commit/8599dc61c3ef2d8acac9dfa28a40cce60f350c4d))
* scan single-pane fast path for hooks ([9d69490](https://github.com/aguil/work/commit/9d69490678855958f3a9298633ee26e3ee264130))
* scope status command to session with live-agent counts ([be2a699](https://github.com/aguil/work/commit/be2a699952b8748e73583b4d9f8f88814a3c864a))
* show git sync counts in sidebar trees ([5ebb66d](https://github.com/aguil/work/commit/5ebb66df770ea6bafcfb1899983a9aaaa7ae268a))
* **sidebar:** agents panel, session cards, and Nerdfont glyphs ([21a6db3](https://github.com/aguil/work/commit/21a6db3b779638fb04fcbfd2f5f33f2dd13a7647))
* **sidebar:** agents panel, session cards, and Nerdfont status glyphs ([d19c673](https://github.com/aguil/work/commit/d19c673872c0732df36dedff5515bf1b8c32dcf9))
* **sidebar:** format session index like tmux choose-session ([089cb01](https://github.com/aguil/work/commit/089cb01dc1f35913c312640bef1104e8a8a0d60e))
* **sidebar:** use choose-tree order for session shortcut keys ([266a8b7](https://github.com/aguil/work/commit/266a8b7370599bd70647e7b5f3003eab79b58a83))
* surface detection metadata and harden herdr backend ([52a5453](https://github.com/aguil/work/commit/52a54536c779dd72b6989f806c2f4bf39d97fe2c))
* surface tree VCS metadata in sidebar and daemon ([f8fc5be](https://github.com/aguil/work/commit/f8fc5bec895fe27079d73617da7c2865792f65c7))
* **tmux:** expose session index and pane window name ([302d1ba](https://github.com/aguil/work/commit/302d1ba961266901a321d9fa8b5cb2e9bf76a68a))
* **tmux:** wire session shortcut keys to config and tmux option ([8b06ec1](https://github.com/aguil/work/commit/8b06ec1b931f54c5068ff9c000c47be0450fc858))
* use herdr for agent detection without bundled manifests ([0357414](https://github.com/aguil/work/commit/0357414aa29f21a73bdc3e1f45953a576d1c63e5))
* **vcs:** parse jj change IDs for colored revision labels ([721bcbe](https://github.com/aguil/work/commit/721bcbe7de778f59c7d4273d8227a88f3da8eed2))
* workspace manager, daemon, hooks, and work rebrand ([1636130](https://github.com/aguil/work/commit/1636130613839cd593796ff4ecff5f285493411c))


### Fixed

* add session hydrate for tracked tmux options ([5cd6aec](https://github.com/aguil/work/commit/5cd6aecfe65e4262f50eacfee2484588541d53fb))
* address code-review findings on session shortcut keys ([d8fb277](https://github.com/aguil/work/commit/d8fb27715a1c9c4e64c4f3d58a8507d0de276954))
* align daemon agent sync with reconcile detach rules ([ec3474d](https://github.com/aguil/work/commit/ec3474da609d68aad5cea90e32abcc8a3cb0c524))
* align README tables for prettier pre-commit ([e0403ed](https://github.com/aguil/work/commit/e0403ed195de68489ccc4bda421f676c4547e225))
* bump smol-toml to address moderate DoS advisory ([219bc47](https://github.com/aguil/work/commit/219bc4713aa2c2fe22eaffb5e7b03a6f2d758673))
* clear screen metadata on all agent detach paths ([04cb0cd](https://github.com/aguil/work/commit/04cb0cd667f84a3def62d5c1217650b6e13d1ecc))
* **daemon:** decouple slow tree refresh from agent polling ([f7a142b](https://github.com/aguil/work/commit/f7a142b509497b27cc1bdaf2a9b1ea8ccb884d09))
* **daemon:** keep workspace agents stable across poll misses ([1e79a06](https://github.com/aguil/work/commit/1e79a0649aaec865b435fe5d86846e4d7d145882))
* **daemon:** stamp tmux labels when discovering new agents ([0491ce3](https://github.com/aguil/work/commit/0491ce38f560a04eda623b42fe16a529b78e55b8))
* **daemon:** wait for workd socket on startup ([737339d](https://github.com/aguil/work/commit/737339d1a21985b60c03cf7c6c227d3dedb526ba))
* detach agents from restored pane id reuse ([b54fbf9](https://github.com/aguil/work/commit/b54fbf91d6d38a6a16d3a197089488c5c9b2c9f2))
* detach agents when pane is no longer detected ([ff7cee8](https://github.com/aguil/work/commit/ff7cee8459fa30b30f1275277a8d79e50c75e071))
* discover nested repos under scan roots ([cb3dc91](https://github.com/aguil/work/commit/cb3dc91cd2ded9906d203b0884778ea4e6842837))
* format sidebar renderer for biome ([b3a534b](https://github.com/aguil/work/commit/b3a534bd547eec88751deed6e80a2074cfb766bd))
* **hooks:** flush deferred unarchive saves on hook exit ([efbfb4a](https://github.com/aguil/work/commit/efbfb4ae29ef61360df3d2600f75ed7340a8b578))
* **hooks:** persist unarchive before writing conversation binding ([aaee084](https://github.com/aguil/work/commit/aaee0844a2bc05934a135e4f70205e4a195e982a))
* **hooks:** resolve conversation in auto-unarchived workspaces ([1649383](https://github.com/aguil/work/commit/16493837676485182157fc4d200ea50ce73c5d56))
* **hooks:** skip pane lookup on no-op events without conversation ([42e397f](https://github.com/aguil/work/commit/42e397fb13846305a1337a9d563b5c123bf6d60e))
* **hooks:** skip workspace load on no-op hook events ([d831f6f](https://github.com/aguil/work/commit/d831f6f307201751049260aeeb47d1784bd9c8bc))
* **hooks:** verify binding session is live before unarchive ([7766982](https://github.com/aguil/work/commit/77669822005253d3d87356bd0e2c0ab21f9e9930))
* idle agent detection and checkout-base tree discovery ([ca89c75](https://github.com/aguil/work/commit/ca89c75d4873e29e145d2c950fea746d660ae9ad))
* ignore stale agent shells without running process ([036428d](https://github.com/aguil/work/commit/036428d0aa69ed8632f82a18e3b06cb7603820d9))
* isolate window use-repo test from pane cwd discovery ([e5822d9](https://github.com/aguil/work/commit/e5822d903d305c766176d606663ccddef4a0f7fa))
* keep tmux state aggregation responsive ([c19acf2](https://github.com/aguil/work/commit/c19acf2dd63519fa34dcdd7cf3cffede0c3a5750))
* make sidebar daemon snapshots fast ([54277b8](https://github.com/aguil/work/commit/54277b8eeecb4e8275343b089b5321e9cab7f5d1))
* **observe:** ignore herdr false blocked during active turns ([71f3799](https://github.com/aguil/work/commit/71f37996a65ac9b04b57ad84e759f75efcb896b0))
* **observe:** reject herdr blocked when manifest shows idle ([1ee8ba2](https://github.com/aguil/work/commit/1ee8ba24d318fad047dc8b597f347a7796e037f2))
* persist evidence-only observation changes ([db75264](https://github.com/aguil/work/commit/db75264437e076aa08d27d039621d7ec690270d5))
* README cache wording and consolidate shortcut config module ([9eb1681](https://github.com/aguil/work/commit/9eb1681f4bbbf00fabfd691258c19cfa13a5633f))
* reconcile re-attaches detached agents on agent CLI panes ([0e928a5](https://github.com/aguil/work/commit/0e928a59b2d5a70c8259ddf463bf60705fbb908c))
* **reconcile:** require live pane match before re-attaching detached agents ([b7a9569](https://github.com/aguil/work/commit/b7a95696fdb1e7ecddb598265a2e68d796611014))
* **release:** align npm publish with release-please tags ([f4bfdf2](https://github.com/aguil/work/commit/f4bfdf2c232be49177d46f8d9bca1223627a82dd))
* **release:** align npm publish with release-please tags ([75ffa08](https://github.com/aguil/work/commit/75ffa08230f5a172ac8a42da4d4dc0e8c6275dd4))
* repair tracked session tmux options ([958a6cb](https://github.com/aguil/work/commit/958a6cbc60baf739e5d3ad825ddc5710c9af5ce0))
* restore archived workspaces on re-track ([afff704](https://github.com/aguil/work/commit/afff70401dfddc392941b9016668b0b4fd464037))
* restore manifest process_names for child-process detection ([c21a573](https://github.com/aguil/work/commit/c21a5736c995bf3d1641442a481e3b42b5d4e972))
* restore smol-toml lockfile to public npm registry ([70f5936](https://github.com/aguil/work/commit/70f593631ed75e9449375384d4990ce1c4025db1))
* **scanner:** match foreground CLI to registered agent ([ff3ea66](https://github.com/aguil/work/commit/ff3ea66026b0e1ac29e647bbe151c1609260c9c8))
* **scanner:** require live evidence for labeled agent-cli panes ([60354df](https://github.com/aguil/work/commit/60354dff6899b64ed1362065c5b481072a5a1e52))
* **scanner:** stabilize registered agent pane detection ([cc38658](https://github.com/aguil/work/commit/cc38658f88da1ec671ae57335848a1997d1e5ba7))
* **scanner:** stop cross-CLI retention in paneStillHostsAgent ([5259790](https://github.com/aguil/work/commit/5259790f9cafcca004a769158b04bf00161eecdc))
* shell-quote action template substitutions ([a49e113](https://github.com/aguil/work/commit/a49e113a50484b2dee677705f48397ff62585d8d))
* **sidebar:** align window index with tmux and resolve agent session ([d6ef568](https://github.com/aguil/work/commit/d6ef5683731b2aa258cae36312a17c103fa47d3b))
* **sidebar:** preserve live agents after daemon reload ([cf01c60](https://github.com/aguil/work/commit/cf01c60febc9558fc4eb2e2165b2d6da61ab1d54))
* **sidebar:** stop flashing on unchanged daemon polls ([adb3a9c](https://github.com/aguil/work/commit/adb3a9cedb4645a474f9319648bb3a4a6e643a22))
* **sidebar:** truncate visible width without breaking ANSI ([f036f51](https://github.com/aguil/work/commit/f036f5163c99c052e971f786a8f1aab7097050a8))
* skip compile and test CI steps when src is absent ([1439be3](https://github.com/aguil/work/commit/1439be34ef34fb18e555f844fdd826112ed4b657))
* skip daemon detach for explicit hook-tracked agents ([746a16b](https://github.com/aguil/work/commit/746a16bc0235a7807abe986abd1a1f5ec8f8584a))
* space tmux status counts ([6f788e8](https://github.com/aguil/work/commit/6f788e8741387d2f74063d1d64ae5d03d307d4ac))
* split WORK_BIN argv in Cursor hook script ([f010e99](https://github.com/aguil/work/commit/f010e99bd990f9d6c68044b10fc81f95374c8d84))
* stabilize sidebar agent list accuracy ([7f17318](https://github.com/aguil/work/commit/7f1731883080eb4a629591870281cc83a9316a4c))
* tighten Cursor agent detection and tmux session targeting ([afbc94c](https://github.com/aguil/work/commit/afbc94cdda02e4403d7c46c93e375f6b7b17edb5))
* update status tests for Nerdfont icons ([14e3ea6](https://github.com/aguil/work/commit/14e3ea600f9985b4718af5043334e268b9a69314))
* workd sidebar stability, polling, and agent detection ([1cce910](https://github.com/aguil/work/commit/1cce910559aa74a01ee9e93d7ff2f64fc218eda6))
* **workspace:** reactivate archived sessions for live tmux ([291bcc3](https://github.com/aguil/work/commit/291bcc39f48e251f8336812ce80a6610ca9465bd))
* write workspace state with owner-only permissions ([a424f84](https://github.com/aguil/work/commit/a424f84eb386bb9d55cb237efae421967bf50aef))


### Performance

* cache agent child-process lookups during detection scans ([7cdc2bb](https://github.com/aguil/work/commit/7cdc2bb0c5cce0bfa69877fa04db2048462f01af))
* **daemon:** reduce per-poll process inspection on agent miss path ([2fc6412](https://github.com/aguil/work/commit/2fc641219270ab9864e94698b4ed7a7b27619c28)), closes [#14](https://github.com/aguil/work/issues/14)
* **daemon:** reuse pane list in syncAgentsToWorkspace ([70c271d](https://github.com/aguil/work/commit/70c271d2e8eb40656df40c2015276207af28a589))
* hook, daemon, and scanner hot-path optimizations ([d61d180](https://github.com/aguil/work/commit/d61d180016764a113aa85a73ce510c0e3ee89cdf))
* **hooks:** dedupe tmux pane lookups per hook invocation ([499750e](https://github.com/aguil/work/commit/499750e53cc5e57a4dfc81dac544eca01c3f9391)), closes [#13](https://github.com/aguil/work/issues/13)
* **hooks:** optimize workspace resolution on hook hot path ([c3f6a0e](https://github.com/aguil/work/commit/c3f6a0ea9dfabed0966b3a460ea4e440cd20b429)), closes [#12](https://github.com/aguil/work/issues/12)
* **scanner:** avoid linear CLI process scans on labeled panes ([af0dbf1](https://github.com/aguil/work/commit/af0dbf138c40211d6d2944d56ed3af7a9a63f4b9)), closes [#15](https://github.com/aguil/work/issues/15)
* **scanner:** reuse process cache in paneStillHostsAgent ([b14ff2f](https://github.com/aguil/work/commit/b14ff2f87d2611dc2985cdcdb6f96c6ac077dc10))
* **sidebar:** reduce workd reconnect delay ([537a978](https://github.com/aguil/work/commit/537a978a01ca7e24564c6329c40d4f24ff22071a))
* **sidebar:** reduce workd reconnect delay ([1633917](https://github.com/aguil/work/commit/16339178d73f409669ae4b075549fa76a50e0837))
* **workspace:** reuse workspace list in session resolve ([f2cf56c](https://github.com/aguil/work/commit/f2cf56c527abbd5d1f2eeda353ab0d7dd7b5fd90))
* **workspace:** skip has-session when session already listed ([007a834](https://github.com/aguil/work/commit/007a83492e87ef7435a74be40358d34da1593ef4))


### Changed

* **adapters:** extract isActiveAgentTitle helper ([50a43dd](https://github.com/aguil/work/commit/50a43ddf14dc462a68b21b30df865d76a2b9dce9))
* extract scanSession helper ([3850770](https://github.com/aguil/work/commit/3850770be58e07d1d7834d6078db1ffd713f49d8))
* extract shared workspace tree helpers ([457483c](https://github.com/aguil/work/commit/457483cbec380a14e38530b58653a8fa9236c1bb))

## [0.1.1](https://github.com/aguil/work/compare/work-v0.1.0...work-v0.1.1) (2026-07-12)

### Added

- add agent launch and relaunch commands ([3ac548c](https://github.com/aguil/work/commit/3ac548c6e7d1b683ea70ccb07511eb0b075e9df2))
- add Claude Code status manifest for Tier 2 observation ([53bc358](https://github.com/aguil/work/commit/53bc358c68835a88bce76efbd85aa89cbf407f0c))
- add git and jj VCS detection ([47712a6](https://github.com/aguil/work/commit/47712a685611aaf4b5149a9d2dac89a80a56c91f))
- add hooks install claude command ([b2a3cf0](https://github.com/aguil/work/commit/b2a3cf012dbcbf83274c3b8af58f6f65f66cd3a3))
- add interactive workspace creation (workctl new/close) ([96f11aa](https://github.com/aguil/work/commit/96f11aa2bff07475deac68b57787893caaa0bd07))
- add optional herdr-backed Tier 2 detection backend ([0569f3f](https://github.com/aguil/work/commit/0569f3f6682ba90657b51b121b5cbd7277974588))
- add Phase 1 CLI commands ([1239897](https://github.com/aguil/work/commit/1239897ccd9bb587a2c96675dd5dc452d6903f7e))
- add Phase 4 actions, repos, and picker config ([28b6f48](https://github.com/aguil/work/commit/28b6f4823f499a41ab0f76733365a7d1c52af478))
- add sidebar TUI ([64340c9](https://github.com/aguil/work/commit/64340c9d3acb7fb0fbdbdc9b8192ef8242210b92))
- add tmux client and config modules ([a19296a](https://github.com/aguil/work/commit/a19296a4d2a259951fa984c91486a97bead83dc5))
- add tree management commands ([732ed22](https://github.com/aguil/work/commit/732ed227f02430a51b971b9e3b77c71704fde93e))
- add workctld daemon and IPC ([92690bf](https://github.com/aguil/work/commit/92690bf437f1e7b0a4b77ff0eba3dbdfedd2c739))
- add workspace state and agent scanner ([18a523c](https://github.com/aguil/work/commit/18a523ceb77392d368261b9f558ed60d14056b5f))
- add-tree --open flag ([54b7d5d](https://github.com/aguil/work/commit/54b7d5d94db0ebd28029d88ca5b1d6cf44620367))
- cache herdr explain results by pane screen hash ([2e34a2d](https://github.com/aguil/work/commit/2e34a2d25f006cc9d22ecd20930bbf0b6fe7923c))
- cache herdr verdicts and extend scanner detection ([bbd07f2](https://github.com/aguil/work/commit/bbd07f24356b38fb965cf626ea00fa98c2c8398d))
- Claude Code hooks and harden agent tracking ([66995b5](https://github.com/aguil/work/commit/66995b59b17809863f645483d748f9db906f8e86))
- **config:** add session-shortcut-index setting ([4e0a8b4](https://github.com/aguil/work/commit/4e0a8b41303a364b1cfbd35d06896d9295123c72))
- **config:** add session-shortcut-keys setting ([c42a67b](https://github.com/aguil/work/commit/c42a67b12ecededcd86377b755bfda4808dbe6d3))
- configurable session shortcut keys for sidebar ([4002c9b](https://github.com/aguil/work/commit/4002c9b8d6c0888ceb171d8c1f75e64471c3ec6c))
- create project checkout on window use-repo ([268feb6](https://github.com/aguil/work/commit/268feb6de20a21733d3f98fd3a5c4f93ff355d8d))
- Cursor hooks Tier 1 status via agent hook-event ([18af894](https://github.com/aguil/work/commit/18af89492f478938ee0abd939765c71f38bdfe51))
- **daemon:** enrich agent and tree snapshots for sidebar ([a404875](https://github.com/aguil/work/commit/a404875bad6b644ee64945534facd891cd5eebc7))
- extract shared agent display rules for sidebar ([7ee8dde](https://github.com/aguil/work/commit/7ee8ddee2e936e432f84d281d990815d5189f83b))
- generalize hook events for Claude Code PascalCase ([8ad30ec](https://github.com/aguil/work/commit/8ad30ec59c10e9e9df009e51027060cfbe22da9e))
- multi repo-scan-dir and remove dead picker config ([dda6dd1](https://github.com/aguil/work/commit/dda6dd1455e65e22bb0496552a2c2b1e1991f185))
- optional herdr-backed Tier 2 agent detection ([a5454b4](https://github.com/aguil/work/commit/a5454b4be993038dd007adbdefcd5022dc0192fd))
- remove-tree checkout cleanup with removal warnings ([8599dc6](https://github.com/aguil/work/commit/8599dc61c3ef2d8acac9dfa28a40cce60f350c4d))
- scan single-pane fast path for hooks ([9d69490](https://github.com/aguil/work/commit/9d69490678855958f3a9298633ee26e3ee264130))
- scope status command to session with live-agent counts ([be2a699](https://github.com/aguil/work/commit/be2a699952b8748e73583b4d9f8f88814a3c864a))
- show git sync counts in sidebar trees ([5ebb66d](https://github.com/aguil/work/commit/5ebb66df770ea6bafcfb1899983a9aaaa7ae268a))
- **sidebar:** agents panel, session cards, and Nerdfont glyphs ([21a6db3](https://github.com/aguil/work/commit/21a6db3b779638fb04fcbfd2f5f33f2dd13a7647))
- **sidebar:** agents panel, session cards, and Nerdfont status glyphs ([d19c673](https://github.com/aguil/work/commit/d19c673872c0732df36dedff5515bf1b8c32dcf9))
- **sidebar:** format session index like tmux choose-session ([089cb01](https://github.com/aguil/work/commit/089cb01dc1f35913c312640bef1104e8a8a0d60e))
- **sidebar:** use choose-tree order for session shortcut keys ([266a8b7](https://github.com/aguil/work/commit/266a8b7370599bd70647e7b5f3003eab79b58a83))
- surface detection metadata and harden herdr backend ([52a5453](https://github.com/aguil/work/commit/52a54536c779dd72b6989f806c2f4bf39d97fe2c))
- surface tree VCS metadata in sidebar and daemon ([f8fc5be](https://github.com/aguil/work/commit/f8fc5bec895fe27079d73617da7c2865792f65c7))
- **tmux:** expose session index and pane window name ([302d1ba](https://github.com/aguil/work/commit/302d1ba961266901a321d9fa8b5cb2e9bf76a68a))
- **tmux:** wire session shortcut keys to config and tmux option ([8b06ec1](https://github.com/aguil/work/commit/8b06ec1b931f54c5068ff9c000c47be0450fc858))
- use herdr for agent detection without bundled manifests ([0357414](https://github.com/aguil/work/commit/0357414aa29f21a73bdc3e1f45953a576d1c63e5))
- **vcs:** parse jj change IDs for colored revision labels ([721bcbe](https://github.com/aguil/work/commit/721bcbe7de778f59c7d4273d8227a88f3da8eed2))
- workspace manager, daemon, hooks, and work rebrand ([1636130](https://github.com/aguil/work/commit/1636130613839cd593796ff4ecff5f285493411c))

### Fixed

- add session hydrate for tracked tmux options ([5cd6aec](https://github.com/aguil/work/commit/5cd6aecfe65e4262f50eacfee2484588541d53fb))
- address code-review findings on session shortcut keys ([d8fb277](https://github.com/aguil/work/commit/d8fb27715a1c9c4e64c4f3d58a8507d0de276954))
- align daemon agent sync with reconcile detach rules ([ec3474d](https://github.com/aguil/work/commit/ec3474da609d68aad5cea90e32abcc8a3cb0c524))
- align README tables for prettier pre-commit ([e0403ed](https://github.com/aguil/work/commit/e0403ed195de68489ccc4bda421f676c4547e225))
- bump smol-toml to address moderate DoS advisory ([219bc47](https://github.com/aguil/work/commit/219bc4713aa2c2fe22eaffb5e7b03a6f2d758673))
- clear screen metadata on all agent detach paths ([04cb0cd](https://github.com/aguil/work/commit/04cb0cd667f84a3def62d5c1217650b6e13d1ecc))
- **daemon:** decouple slow tree refresh from agent polling ([f7a142b](https://github.com/aguil/work/commit/f7a142b509497b27cc1bdaf2a9b1ea8ccb884d09))
- **daemon:** keep workspace agents stable across poll misses ([1e79a06](https://github.com/aguil/work/commit/1e79a0649aaec865b435fe5d86846e4d7d145882))
- **daemon:** stamp tmux labels when discovering new agents ([0491ce3](https://github.com/aguil/work/commit/0491ce38f560a04eda623b42fe16a529b78e55b8))
- **daemon:** wait for workd socket on startup ([737339d](https://github.com/aguil/work/commit/737339d1a21985b60c03cf7c6c227d3dedb526ba))
- detach agents from restored pane id reuse ([b54fbf9](https://github.com/aguil/work/commit/b54fbf91d6d38a6a16d3a197089488c5c9b2c9f2))
- detach agents when pane is no longer detected ([ff7cee8](https://github.com/aguil/work/commit/ff7cee8459fa30b30f1275277a8d79e50c75e071))
- discover nested repos under scan roots ([cb3dc91](https://github.com/aguil/work/commit/cb3dc91cd2ded9906d203b0884778ea4e6842837))
- format sidebar renderer for biome ([b3a534b](https://github.com/aguil/work/commit/b3a534bd547eec88751deed6e80a2074cfb766bd))
- **hooks:** flush deferred unarchive saves on hook exit ([efbfb4a](https://github.com/aguil/work/commit/efbfb4ae29ef61360df3d2600f75ed7340a8b578))
- **hooks:** persist unarchive before writing conversation binding ([aaee084](https://github.com/aguil/work/commit/aaee0844a2bc05934a135e4f70205e4a195e982a))
- **hooks:** resolve conversation in auto-unarchived workspaces ([1649383](https://github.com/aguil/work/commit/16493837676485182157fc4d200ea50ce73c5d56))
- **hooks:** skip pane lookup on no-op events without conversation ([42e397f](https://github.com/aguil/work/commit/42e397fb13846305a1337a9d563b5c123bf6d60e))
- **hooks:** skip workspace load on no-op hook events ([d831f6f](https://github.com/aguil/work/commit/d831f6f307201751049260aeeb47d1784bd9c8bc))
- **hooks:** verify binding session is live before unarchive ([7766982](https://github.com/aguil/work/commit/77669822005253d3d87356bd0e2c0ab21f9e9930))
- idle agent detection and checkout-base tree discovery ([ca89c75](https://github.com/aguil/work/commit/ca89c75d4873e29e145d2c950fea746d660ae9ad))
- ignore stale agent shells without running process ([036428d](https://github.com/aguil/work/commit/036428d0aa69ed8632f82a18e3b06cb7603820d9))
- isolate window use-repo test from pane cwd discovery ([e5822d9](https://github.com/aguil/work/commit/e5822d903d305c766176d606663ccddef4a0f7fa))
- keep tmux state aggregation responsive ([c19acf2](https://github.com/aguil/work/commit/c19acf2dd63519fa34dcdd7cf3cffede0c3a5750))
- make sidebar daemon snapshots fast ([54277b8](https://github.com/aguil/work/commit/54277b8eeecb4e8275343b089b5321e9cab7f5d1))
- **observe:** ignore herdr false blocked during active turns ([71f3799](https://github.com/aguil/work/commit/71f37996a65ac9b04b57ad84e759f75efcb896b0))
- **observe:** reject herdr blocked when manifest shows idle ([1ee8ba2](https://github.com/aguil/work/commit/1ee8ba24d318fad047dc8b597f347a7796e037f2))
- persist evidence-only observation changes ([db75264](https://github.com/aguil/work/commit/db75264437e076aa08d27d039621d7ec690270d5))
- README cache wording and consolidate shortcut config module ([9eb1681](https://github.com/aguil/work/commit/9eb1681f4bbbf00fabfd691258c19cfa13a5633f))
- reconcile re-attaches detached agents on agent CLI panes ([0e928a5](https://github.com/aguil/work/commit/0e928a59b2d5a70c8259ddf463bf60705fbb908c))
- **reconcile:** require live pane match before re-attaching detached agents ([b7a9569](https://github.com/aguil/work/commit/b7a95696fdb1e7ecddb598265a2e68d796611014))
- repair tracked session tmux options ([958a6cb](https://github.com/aguil/work/commit/958a6cbc60baf739e5d3ad825ddc5710c9af5ce0))
- restore archived workspaces on re-track ([afff704](https://github.com/aguil/work/commit/afff70401dfddc392941b9016668b0b4fd464037))
- restore manifest process_names for child-process detection ([c21a573](https://github.com/aguil/work/commit/c21a5736c995bf3d1641442a481e3b42b5d4e972))
- restore smol-toml lockfile to public npm registry ([70f5936](https://github.com/aguil/work/commit/70f593631ed75e9449375384d4990ce1c4025db1))
- **scanner:** match foreground CLI to registered agent ([ff3ea66](https://github.com/aguil/work/commit/ff3ea66026b0e1ac29e647bbe151c1609260c9c8))
- **scanner:** require live evidence for labeled agent-cli panes ([60354df](https://github.com/aguil/work/commit/60354dff6899b64ed1362065c5b481072a5a1e52))
- **scanner:** stabilize registered agent pane detection ([cc38658](https://github.com/aguil/work/commit/cc38658f88da1ec671ae57335848a1997d1e5ba7))
- **scanner:** stop cross-CLI retention in paneStillHostsAgent ([5259790](https://github.com/aguil/work/commit/5259790f9cafcca004a769158b04bf00161eecdc))
- shell-quote action template substitutions ([a49e113](https://github.com/aguil/work/commit/a49e113a50484b2dee677705f48397ff62585d8d))
- **sidebar:** align window index with tmux and resolve agent session ([d6ef568](https://github.com/aguil/work/commit/d6ef5683731b2aa258cae36312a17c103fa47d3b))
- **sidebar:** preserve live agents after daemon reload ([cf01c60](https://github.com/aguil/work/commit/cf01c60febc9558fc4eb2e2165b2d6da61ab1d54))
- **sidebar:** stop flashing on unchanged daemon polls ([adb3a9c](https://github.com/aguil/work/commit/adb3a9cedb4645a474f9319648bb3a4a6e643a22))
- **sidebar:** truncate visible width without breaking ANSI ([f036f51](https://github.com/aguil/work/commit/f036f5163c99c052e971f786a8f1aab7097050a8))
- skip compile and test CI steps when src is absent ([1439be3](https://github.com/aguil/work/commit/1439be34ef34fb18e555f844fdd826112ed4b657))
- skip daemon detach for explicit hook-tracked agents ([746a16b](https://github.com/aguil/work/commit/746a16bc0235a7807abe986abd1a1f5ec8f8584a))
- space tmux status counts ([6f788e8](https://github.com/aguil/work/commit/6f788e8741387d2f74063d1d64ae5d03d307d4ac))
- split WORK_BIN argv in Cursor hook script ([f010e99](https://github.com/aguil/work/commit/f010e99bd990f9d6c68044b10fc81f95374c8d84))
- stabilize sidebar agent list accuracy ([7f17318](https://github.com/aguil/work/commit/7f1731883080eb4a629591870281cc83a9316a4c))
- tighten Cursor agent detection and tmux session targeting ([afbc94c](https://github.com/aguil/work/commit/afbc94cdda02e4403d7c46c93e375f6b7b17edb5))
- update status tests for Nerdfont icons ([14e3ea6](https://github.com/aguil/work/commit/14e3ea600f9985b4718af5043334e268b9a69314))
- workd sidebar stability, polling, and agent detection ([1cce910](https://github.com/aguil/work/commit/1cce910559aa74a01ee9e93d7ff2f64fc218eda6))
- **workspace:** reactivate archived sessions for live tmux ([291bcc3](https://github.com/aguil/work/commit/291bcc39f48e251f8336812ce80a6610ca9465bd))
- write workspace state with owner-only permissions ([a424f84](https://github.com/aguil/work/commit/a424f84eb386bb9d55cb237efae421967bf50aef))

### Performance

- cache agent child-process lookups during detection scans ([7cdc2bb](https://github.com/aguil/work/commit/7cdc2bb0c5cce0bfa69877fa04db2048462f01af))
- **daemon:** reduce per-poll process inspection on agent miss path ([2fc6412](https://github.com/aguil/work/commit/2fc641219270ab9864e94698b4ed7a7b27619c28)), closes [#14](https://github.com/aguil/work/issues/14)
- **daemon:** reuse pane list in syncAgentsToWorkspace ([70c271d](https://github.com/aguil/work/commit/70c271d2e8eb40656df40c2015276207af28a589))
- hook, daemon, and scanner hot-path optimizations ([d61d180](https://github.com/aguil/work/commit/d61d180016764a113aa85a73ce510c0e3ee89cdf))
- **hooks:** dedupe tmux pane lookups per hook invocation ([499750e](https://github.com/aguil/work/commit/499750e53cc5e57a4dfc81dac544eca01c3f9391)), closes [#13](https://github.com/aguil/work/issues/13)
- **hooks:** optimize workspace resolution on hook hot path ([c3f6a0e](https://github.com/aguil/work/commit/c3f6a0ea9dfabed0966b3a460ea4e440cd20b429)), closes [#12](https://github.com/aguil/work/issues/12)
- **scanner:** avoid linear CLI process scans on labeled panes ([af0dbf1](https://github.com/aguil/work/commit/af0dbf138c40211d6d2944d56ed3af7a9a63f4b9)), closes [#15](https://github.com/aguil/work/issues/15)
- **scanner:** reuse process cache in paneStillHostsAgent ([b14ff2f](https://github.com/aguil/work/commit/b14ff2f87d2611dc2985cdcdb6f96c6ac077dc10))
- **sidebar:** reduce workd reconnect delay ([537a978](https://github.com/aguil/work/commit/537a978a01ca7e24564c6329c40d4f24ff22071a))
- **sidebar:** reduce workd reconnect delay ([1633917](https://github.com/aguil/work/commit/16339178d73f409669ae4b075549fa76a50e0837))
- **workspace:** reuse workspace list in session resolve ([f2cf56c](https://github.com/aguil/work/commit/f2cf56c527abbd5d1f2eeda353ab0d7dd7b5fd90))
- **workspace:** skip has-session when session already listed ([007a834](https://github.com/aguil/work/commit/007a83492e87ef7435a74be40358d34da1593ef4))

### Changed

- **adapters:** extract isActiveAgentTitle helper ([50a43dd](https://github.com/aguil/work/commit/50a43ddf14dc462a68b21b30df865d76a2b9dce9))
- extract scanSession helper ([3850770](https://github.com/aguil/work/commit/3850770be58e07d1d7834d6078db1ffd713f49d8))
- extract shared workspace tree helpers ([457483c](https://github.com/aguil/work/commit/457483cbec380a14e38530b58653a8fa9236c1bb))

## [0.1.0] - 2026-07-12

### Added

- Initial public npm release as `@aguil/work`.
- `work` and `workd` CLIs for tmux session workspace tracking.
- Agent detection by process name, pane labels, and optional [herdr](https://herdr.dev) backend.
- Sidebar TUI (`work sidebar`) for agents and git/jj trees.
- Tier 1 agent hooks for Cursor and Claude Code (`work hooks install`).
- Git worktree and jj workspace management (`add-tree`, `remove-tree`, `new`).
- Configurable actions (`~/.config/work/actions/*.toml`) with trust store.
- XDG-based config and state under `~/.config/work` and `~/.local/state/work`.

[0.1.0]: https://github.com/aguil/work/releases/tag/v0.1.0
