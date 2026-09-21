# HUMANTHROWER

Physics-based arcade / ragdoll survival с механикой очистки рядов (Tetris-like grid под
настоящей физикой). Ты — единственный человечек на дне вертикального стеклянного контейнера;
сверху падают ragdoll-люди; заполненная строка уничтожает только то, что в неё попало, а
выжившие части разделяются на независимые stackable pieces (Detachment System).

**Zero assets** — вся графика и звук процедурные. Управление: ← → / A D — движение,
Space / W — прыжок (в воздухе — dive-стомп), S — присесть, P / Esc — пауза, ` / F3 — дебаг.

## Стек

- TypeScript (strict) + Vite 6
- PixiJS v8 (WebGL2, `?gpu=1` — попытка WebGPU)
- `@dimforge/rapier2d-compat` (WASM, base64-инлайн)
- Web Audio (процедурные SFX + музыка-секвенсор)
- Vitest (юнит) + Playwright (e2e)

## Запуск

```bash
npm install
npm run dev        # dev-сервер http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # прод-сборка http://127.0.0.1:4173
npm test           # юнит-тесты (vitest)
npx playwright test  # e2e smoke (поднимает preview сам)
```

## URL-параметры (GDD §54)

| Параметр | Значение |
|---|---|
| `?seed=12345` | детерминированный сид (mulberry32) |
| `?scenario=seed_001..009` | сценарные спавны из `tests/scenarios.ts` |
| `?debug=1` | дебаг-оверлей (`/ F3`) + `window.__HT_DEBUG__` хуки |
| `?gpu=1` | попытка WebGPU-бэкенда (фолбэк WebGL2) |
| `?autostart=1` | сразу начать забег (для e2e) |

Debug-хуки: `forceSpawn(archetype?)`, `forceRowComplete(row?)`, `killPlayer()`, `addScore(n)`, `getState()`.

## Архитектура (GDD §2, §22)

Физика ≠ презентация: gameplay-модули не импортируют Pixi, рендер — Rapier. Fixed timestep
60 Hz + accumulator (maxSubsteps 3, остаток сбрасывается — честный slowdown), render
интерполяция alpha. Чистые модули (GridManager / RowDetector / DetachmentSystem.resolve /
ScoreSystem) — без движка, полностью покрыты юнит-тестами.

```
main.ts → RAPIER.init → pixi app → Game (оркестратор)
Game.fixedStep (12 шагов, GDD §22.1):
  ClearScheduler.tick → player.update → HumanSpawner.update → world.step (+events)
  → RagdollSystem.update (FSM) → GridManager.sample (каждый 3-й шаг) → RowDetector
  → StackManager.update → ScoreSystem.update → DifficultyDirector.update
```

- `src/core/` — Clock (fixed timestep), Input, Rng, Events, Game
- `src/config/` — все тюнинг-константы (balance, physics, archetypes, difficulty, scoring, player, audio, palette, rowClear, settings)
- `src/physics/` — PhysicsWorld (Rapier-обёртка), RagdollFactory (3 core + 4 limb, revolute joints), PieceFactory
- `src/gameplay/` — RagdollSystem (FSM, sleep/wake, LOD), GridManager (occupancy probes), RowDetector, ClearScheduler, DetachmentSystem, PlayerController (hybrid locomotion), HumanSpawner (пулы, anti-frustration), StackManager, ScoreSystem, DifficultyDirector
- `src/render/` — Renderer (слои, letterbox), CameraSystem (trauma² shake), EnvironmentRenderer, HumanRenderer, PlayerRenderer, VfxSystem (пулы частиц/текст), AtlasFactory (процедурные текстуры)
- `src/audio/` — AudioManager, SfxSynth (WebAudio-графы), MusicDirector (lookahead-секвенсор, intensity-слои)
- `src/ui/` — Ui, Hud, Menus, TouchControls, DebugOverlay, ui.css (DOM-оверлей)
- `src/infra/` — Save (localStorage), PerformanceMonitor (auto-quality), ObjectPool
- `tests/` — юнит-тесты чистых модулей + сценарии seed_001..009
- `e2e/` — Playwright smoke
- `docs/GDD_TDD.md` — полный GDD + TDD (34 секции, §A — порядок внедрения, §B — философия)

## Ключевые механики

- **Ragdoll FSM**: falling → landing (Δv>300) → settling (contact damping) → settled (sleep + limbs disabled = LOD1); wake по Δv/опоре/anti-float watchdog.
- **Grid occupancy**: 5 ориентированных probe-точек на часть (вращаются с телом), гистерезис 0.6/0.4, settleable weight (FALLING 0 / SETTLING 0.5 / SETTLED 1.0), ресэмпл 20 Hz.
- **Row clear**: WARNING 0.45s → DANGEROUS 0.70s → revalidate (live coverage) → resolve: полное уничтожение в строке; slice ≥ 50% только torso/legs; head 1×1 full-or-nothing; выжившие → независимые pieces (velocity clamp, NO impulses).
- **NO RANDOM LAUNCHING**: restitution ≤ 0.10, velocity caps 2600 px/s / 14 rad/s, impact Δv cap 1200, sleeping, clamp'нутые stomp-импульсы.
- **Game over**: overflow (danger band 2.5s), trapped (4s, struggle-метр), spawn blocked (6s).
- **Score**: +12/s выживание; clear 120×combo (cap ×4, decay 5s); dodge/stomp/risky/physics-моменты — скилл платит 4–8× пассива.
