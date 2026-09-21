# Проект: humanthrower — физический ragdoll-аркад с очисткой рядов (Tetris-grid под физикой)

## Стек
- TypeScript (strict, noUnusedLocals) + Vite 6 + PixiJS v8 (WebGL2, `?gpu=1` → WebGPU-попытка)
- `@dimforge/rapier2d-compat` ^0.14 (WASM base64, `await RAPIER.init()`)
- Web Audio (процедурные SFX + музыка-секвенсор), Vitest + Playwright, npm (НЕ pnpm — esbuild)

## Архитектура
- Физика ≠ презентация: gameplay не импортирует Pixi, рендер — Rapier. Fixed 60 Hz + accumulator
  (maxSubsteps 3, остаток сброшен), render-интерполяция alpha (prev/cur transform'ы в PartRecord).
- Чистые модули: GridManager (occupancy probes), RowDetector, DetachmentSystem.resolveRowClear,
  ScoreSystem — без движка, полностью в юнит-тестах.
- `Game.fixedStep` (GDD §22.1): ClearScheduler.tick → player → spawner → world.step(+events)
  → ragdolls.update → grid.sample (каждый 3-й шаг) → RowDetector → stack.update → score → difficulty.
- Полный GDD+TDD: `docs/GDD_TDD.md` (34 секции + §A порядок внедрения + §B философия).

## Ключевые файлы
- `src/core/` — Clock, Input, Rng (mulberry32), Events, Game (оркестратор + `__HT_DEBUG__` хуки)
- `src/config/` — balance (720×1280, 9×13, cell 68), physics (группы), archetypes, difficulty,
  scoring, player, audio, palette, rowClear, settings (quality-тиры)
- `src/physics/` — PhysicsWorld (Rapier-обёртка: createCollider(desc, body), drainCollisionEvents
  по хэндлам коллайдеров через getCollider→parent), RagdollFactory (3 core + 4 limb), PieceFactory
- `src/gameplay/` — RagdollSystem (FSM/sleep/wake/LOD, пулы park/respawn), GridManager,
  RowDetector, ClearScheduler, DetachmentSystem, PlayerController (hybrid locomotion, stomp),
  HumanSpawner (пулы по архетипам, anti-frustration), StackManager, ScoreSystem, DifficultyDirector
- `src/render/` — Renderer (слои/letterbox), CameraSystem, EnvironmentRenderer, HumanRenderer,
  PlayerRenderer, VfxSystem (пулы), AtlasFactory (процедурные текстуры)
- `src/audio/` — AudioManager, SfxSynth, MusicDirector (lookahead, intensity-слои)
- `src/ui/` — Ui, Hud, Menus, TouchControls, DebugOverlay, ui.css
- `src/infra/` — Save (localStorage), PerformanceMonitor, ObjectPool
- `tests/` — 9 юнит-файлов (55 тестов) + scenarios (seed_001..009); `e2e/` — 5 smoke
- `README.md` — запуск, URL-параметры, архитектура

## Прогресс
- ✅ Игра ПОЛНОСТЬЮ написана и работает: GDD+TDD, конфиги, физика, геймплей, рендер, аудио, UI,
  Game.ts + main.ts, юнит-тесты 55/55, сборка (tsc strict + vite) зелёная, e2e 5/5 (Chromium).
- ✅ Preview-сервер http://127.0.0.1:4173 (vite preview, фоновый job).
- ✅ Батч правок по фидбеку игрока (8 пунктов):
  1) Рэгдолл полный: конечности спавнятся ВНЕ таза/торса под углом (restAngle ±0.72/±0.42),
     якоря совпадают; ГЛАВНЫЙ фикс — hip-джоинт: якорь таза ЛОКАЛЬНЫЙ hipLocalY (был мировой
     hipWY → ноги висели на 162px ниже таза). Проба: ноги dPelvis 25-29, руки dTorso 23-34 ✓.
  2) «Мелкие прямоугольники вверху» — та же причина (ноги спавнились у y≈12) + limb-снапшоты
     prev/cur в RagdollSystem.update (было только для ядер → конечности рисовались замороженными).
     Проба: STUCK TOP 0 из 22 ✓.
  3) Смерть от очистки ряда: applyClear — игрок grounded и его торс в очищенном ряду →
     kill + gameOver('swept') «Смыло очисткой ряда»; спасение прыжком (в воздухе).
  4) Вырубание от удара по голове: Game.headHitCheck — падающая часть выше игрока, ближе 44px
     к голове, закрывается >3.5 px/шаг → stun 2.2s (control off, lockRot(false), кувыркание).
  5) Грейд спавна круче: spawnInterval 2.6−0.34×(D−1) floor 0.6; velocity +34×(D−1); targeting 0.55.
  6) Руки игрока: 2 Sprite в PlayerRenderer, махи в противофазе, болтаются в воздухе.
  7) 7 выражений лиц (FACE enum): normal/terror/concussion/ko/scream/dead/run + FSM по состояниям
     и exprTimer (контузия 1.6s после сильного удара); отсоединённая голова → dead (крестики+язык).
  8) Диагональная линия на лицах убрана: все текстуры лиц переписаны на arcPolyline (явные
     moveTo/lineTo) — Pixi v8 arc() рисует неявную соединительную линию к началу дуги.
- ✅ e2e дополнен: тест смерти от очистки (ряд 0 → «Смыло»); тест транзакции чистит ряд 2 +
  debug-хук `fly` (полёт вверх, grounded=false — иначе куски падают и заполняют ряд 0).
- ✅ GDD обновлён: §5.4 (Swept + вырубание), §14.1 (строка Swept в таблице), §14.2 (причина
  «Смыло очисткой ряда»), §15.2 (7 выражений лиц). Правка RU-текста — только node (edit-инструмент
  искажает кириллицу в аргументах; read-вывод может показать «Смертей» вместо «Смерти» — проверять
  codePoint'ами). Диагностические скрипты удалены; shot.mjs оставлен + свежие скриншоты
  shot-falling/landed/pile.png (финальная сборка) — юзер открывает PNG для визуальной проверки.
- ✅ Игра в проде (2026-09-21): репо github.com/l10yd/humanthrower-game (public, main) +
  Vercel-проект warl10yd/humanthrower-game → https://humanthrower-game.vercel.app
  (git connect — пуш main = авто-деплой + алиас сам). На gosugames.online: slug
  `humanthrower`, status live, DROP-полка new_drop[0]+fleet[0], постер
  gosu/public/games/humanthrower.svg. Пайплайн выпуска — gosu/docs/deploy-game.md.

## Уроки
- `page.evaluate` не сериализует функции — debug-хуки вызывать строго внутри evaluate.
- Rapier v0.14 API: `drainCollisionEvents((h1: number, h2: number, started) => ...)` — хэндлы
  КОЛЛАЙДЕРОВ, тела через `world.getCollider(h)?.parent()`; `createCollider(desc, body)` (desc первым).
- Якоря джоинтов — ЛОКАЛЬНЫЕ offset'ы тел: мировая точка = pos + rotate(localAnchor, rot).
  Смешение мировых координат с локальными (hipWY в hip-джоинте) = конечность на 162px ниже таза.
- Проба конечностей: группировать ядра ПО ЧЕЛОВЕЧКАМ (id непрерывны по 7), иначе дистанции
  меряются к торсу чужого человечка и вводят в заблуждение.
- Pixi v8 `arc()` следует canvas-спеке: неявный lineTo от текущей точки к началу дуги → артефакт-
  линия на текстуре. Фикс: arcPolyline (явные moveTo/lineTo сегменты) — без engine-arc вообще.
- GridManager.submit: probe-веса умножаются на stateWeight (FALLING 0 / SETTLING 0.5 / SETTLED 1.0) —
  сумма в ячейку, порог 0.6/0.4 (GDD §33.1).
- Пул ragdoll живёт между забегами: parkRagdoll НЕ обнуляет p.alive; resetDynamic удаляет только
  enabled тела; частичные человечки — discardAll (re-enable) перед resetDynamic.

## TODO / что осталось сделать
- Визуальная проверка юзером: открыть shot-falling.png / shot-landed.png / shot-pile.png
  (свежие, финальная сборка) — лица (7 выражений), руки/ноги рэгдолла, руки игрока, без диагонали.
- head-hit стан не пойман пробой (стохастично — человечек не упал на голову) — код в месте,
  логика прямая; проверить вживую: фигурка на голову → 2.2с рэгдолл-режим.
- Мобильные тач-кнопки показываются только на touch-устройствах — проверить на телефоне.
- postMessage-мост gosu (docs/score-protocol.md) — счёт забегов в кабинет игрока; не делался.
