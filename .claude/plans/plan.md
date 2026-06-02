# План: Миграция master на React + Tailwind + Zustand

## Контекст

**Master** — ванильный TypeScript с прямой манипуляцией DOM. React 19 и Tailwind CSS 4 уже в `package.json`, но не используются. Zustand отсутствует.

**WIP-ветка** (`wip/react-migration`) — частичная миграция поверх другой ветки, с ошибками и незавершённой работой. Использует React 18.

**Цель** — чистая миграция с master: переписать `media-player.ts` на React-компоненты, Zustand-стора, Tailwind-стили.

---

## Шаг 1: Установка Zustand ✅

- Добавить `zustand` в `dependencies` через `bun add zustand`

## Шаг 2: Типы и стора (Zustand)

Создать структуру:

```
src/
├── types/index.ts          # Типы (TranscriptionWord, Dictionary, CensoringEffect)
├── store/playerStore.ts    # Zustand стор с полным состоянием плеера
└── ...
```

Стор должен управлять:
- `isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`
- `fileName`, `error`, `warning`
- `loadedDictionaries`, `activeDictionaries`
- `transcriptionResults`
- Actions: все сеттеры + `loadDictionary`, `removeDictionary`, `toggleDictionary`

## Шаг 3: Рефакторинг `media-player.ts` → хук `useMediaPlayer`

Вынести всю логику MediaBunny (playback, seek, volume, audio/video sinks, render loop) в React-хук `src/hooks/useMediaPlayer.ts`:

- Возвращает: `canvasRef`, `playerContainerRef`, `initMediaPlayer`, `play`, `pause`, `seekToTime`, `setVolume`, `toggleMute`
- Синхронизация с Zustand-стором через `store.actions`
- `render()` loop с `requestAnimationFrame`
- `useEffect` для cleanup (stop audio nodes, cancel animation frame)

## Шаг 4: Переписать `index.html` → React entry point

Удалить старый `public/index.html`. Создать:

- `src/index.html` — минимальный HTML с `<div id="root">`
- `src/main.tsx` — `createRoot` → `<App />`
- `src/index.css` — `@import "tailwindcss"` + базовые стили

Обновить `build.ts`:
- `entrypoints: ['./src/index.html']`
- Copy `public/` assets в `dist/`

## Шаг 5: Компоненты

### 5a. `src/App.tsx` — корневой компонент

Макет как в wip-ветке: 2 колонки (плеер слева, словари справа). Использовать `<PlayerProvider>` (пустой wrapper для будущих provider-ов, если нужно).

### 5b. `src/features/player/PlayerDisplay.tsx`

- `<canvas>` с `canvasRef` из хука
- Placeholder "Load video or audio file" когда файл не загружен
- Отображение `fileName` из стора

### 5c. `src/features/player/PlayerControls.tsx`

- Кнопка Play/Pause (SVG-иконки)
- `<ProgressBar />` (вынесен в отдельный компонент)
- `<VolumeControls />` (отдельный компонент)
- `<FullscreenButton />` (отдельный компонент)

### 5d. `src/features/player/ProgressBar.tsx`

- Прогресс-бар с drag-to-seek
- `currentTime` / `duration` из стора
- `onSeek` → `seekToTime` из хука

### 5e. `src/features/player/VolumeControls.tsx`

- Кнопка mute/unmute
- Слайдер громкости
- Связь со стором + хуком

### 5f. `src/features/player/FullscreenButton.tsx`

- `fullscreenchange` listener
- `requestFullscreen` / `exitFullscreen`

### 5g. `src/features/file-loader/FileLoader.tsx`

- Кнопка "Load File" → `<input type="file">`
- Кнопка "Load URL" → `prompt()` (как сейчас)
- Drag-and-drop для файлов
- Вызов `initMediaPlayer()` из хука

### 5h. `src/features/dictionary/DictionaryManager.tsx`

- Таблица загруженных словарей (как в текущем `renderDictTable`)
- Кнопка добавления словаря по slug
- Toggle active/inactive + удалить
- Вызов `loadDictionary` через `fetch` (как сейчас)

### 5i. `src/features/transcription/TranscriptionResults.tsx`

- Кнопка "Transcribe" → **POST-запрос** с FormData (аудио в WAV) на `http://localhost:8686/transcribe` → получаем `{ task_id }`
- **WebSocket** `ws://localhost:8686/ws/status/{task_id}` для проверки готовности задачи:
  - `PROCESSING` — обновить состояние кнопки
  - `DONE` — сохранить `msg.results` в стор, закрыть socket
- **Обработка ошибок:**
  - POST-запрос: если `!response.ok` → показать ошибку, сбросить кнопку в "Transcribe"
  - WebSocket: `onerror` → показать ошибку в UI, закрыть socket, сбросить кнопку
  - Общая ошибка (try/catch): показать "Error. Check Console", сбросить кнопку
- Таблица результатов (как сейчас `renderTranscribeResults`)
- Подсветка активной строки при воспроизведении
- "Jump to time" кнопка

## Шаг 6: Ключевые обработчики

- **Keyboard shortcuts** (Space, K, F, ←, →, M) — `useEffect` в `App.tsx`
- **Drag-and-drop** файлов — `useEffect` в `App.tsx` или `FileLoader`
- **Resize** — `useEffect` в `App.tsx` для обновления прогресс-бара

## Шаг 7: Удаление старого кода

- Удалить `src/media-player.ts`
- Удалить `src/base.ts` (или оставить для `@fontsource` import)
- Удалить `src/base.css` (стили перенесены в Tailwind)
- Удалить `public/index.html`
- Сохранить `src/aho-corasick.ts`, `src/audio.ts`, `src/search.worker.ts` — они нужны

## Шаг 8: Обновление конфигурации

- `package.json`: добавить `zustand`, скрипты (`dev`, `build`, `serve`, `test:e2e`)
- `bunfig.toml`: testing config (если нужно)
- `tsconfig.json`: убедиться что `jsx: "react-jsx"` и пути настроены

## Шаг 9: Проверка сборки

- `bun run build` — сборка должна пройти
- `bun x serve ./dist/` — приложение должно работать
- Проверить: загрузка файла, воспроизведение, пауза, seek, громкость, словари, транскрипция

---

## Архитектура (итоговая)

```
src/
├── index.html              # Entry HTML
├── main.tsx                # React entry
├── index.css               # Tailwind + base styles
├── types/index.ts          # Shared types
├── store/playerStore.ts    # Zustand store
├── hooks/useMediaPlayer.ts # MediaBunny integration hook
├── features/
│   ├── player/
│   │   ├── PlayerDisplay.tsx
│   │   ├── PlayerControls.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── VolumeControls.tsx
│   │   └── FullscreenButton.tsx
│   ├── file-loader/
│   │   └── FileLoader.tsx
│   ├── dictionary/
│   │   └── DictionaryManager.tsx
│   └── transcription/
│       └── TranscriptionResults.tsx
├── aho-corasick.ts         # Aho-Corasick scanner (keep)
├── audio.ts                # Audio utils (keep)
└── search.worker.ts        # Search worker (keep)
```

## Примечания

- **React 19** — используем версию с мастер-ветки, не React 18 из wip
- **Tailwind CSS 4** — уже настроен через `bun-plugin-tailwind`
- **Zustand** — добавляем впервые
- **MediaBunny** — логика не меняется, только оборачивается в React
- **SVG-иконки** — используем inline SVG вместо `<img>` (как в wip), но можно оставить `<img>` для простоты
- **Функции на `window`** — `removeDictionary`, `toggleDictionary`, `jumpToTime` перенести в стор или сделать через `useEffect`
