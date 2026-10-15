# QuizProgressBar

Класс отвечает только за DOM-зону прогресса квиза: обёртку, полоску, счётчик и кнопку «назад». Навигацию он не вызывает. Всё взаимодействие идёт через координатора (`QuizNavigation`).

## Подключение

```js
import QuizProgressBar from './QuizProgressBar';

const progress = new QuizProgressBar({
    steps,                    // список шагов квиза (NodeList / массив)
    counter: 'both',          // необязательно, см. «Режимы счётчика»
    onBackClick: () => nav.prev(),
});
```

Если обёртка `[data-js-quiz-progress]` не найдена, класс пишет предупреждение в консоль и дальше ничего не делает (`isEnabled = false`).

## Параметры конструктора

| Параметр | По умолчанию | Описание |
|---|---|---|
| `steps` | — | Список шагов. Нужен, чтобы определить первый шаг (там скрывается кнопка «назад») |
| `progressElement` | `[data-js-quiz-progress]` | Обёртка прогресса |
| `progressBarSelector` | `[data-js-pagination-progress]` | Заполняемая полоска |
| `backButtonSelector` | `[data-js-pagination-back]` | Кнопка «назад» |
| `currentSelector` | `[data-js-progress-current]` | Текущий номер (или процент в режиме `percent`) |
| `totalSelector` | `[data-js-progress-total]` | Общее число шагов |
| `separatorSelector` | `[data-js-progress-separator]` | Все элементы-разделители («Вопрос», «из», «/») |
| `percentSelector` | `[data-js-progress-percent]` | Отдельный элемент под процент (режим `both`) |
| `slotSelector` | `[data-js-progress-slot]` | Слот внутри шага, куда переезжает обёртка |
| `counter` | `'fraction'` | Режим счётчика |
| `onBackClick` | — | Колбэк клика по кнопке «назад» |

## Режимы счётчика

Источник режима по приоритету:

1. параметр `counter` в конструкторе;
2. атрибут `data-progress-counter` на `[data-js-quiz-progress]`;
3. `'fraction'`.

| Режим | Вывод | Что скрывается |
|---|---|---|
| `fraction` | Вопрос 1 из 17 | `[data-js-progress-percent]` |
| `percent` | 6% | total и все `[data-js-progress-separator]` |
| `both` | Вопрос 1 из 17 6% | ничего |

Неизвестное значение заменяется на `'fraction'` с предупреждением в консоли.

Процент считается по той же формуле, что и ширина полоски: `current / total * 100` (ограничен 0–100). На шаге 1 из 17 это `6%`. Знак `%` добавляет класс, в разметке его писать не нужно.

## Публичный API

### `update(step)`

Вызывается координатором при каждой смене верхнеуровневого шага.

- переключает класс `quiz-progress--hidden`, если у шага `data-hide-progress="true"`;
- скрывает кнопку «назад» на первом шаге (класс `hidden`);
- переносит обёртку в слот шага `[data-js-progress-slot]` или возвращает на исходное место.

### `updateProgressBar(current, total)`

Рисует числа и ширину полоски. Вызывается при смене любого шага, в том числе карточного под-шага внутри страницы. Координатор сам считает `current` и `total`.

### `counter` (геттер/сеттер)

Меняет режим без перерисовки.

### `setCounter(mode)`

Меняет режим и сразу перерисовывает последние переданные `current`/`total`, пересчёт у координатора не нужен.

## Разметка

```jade
mixin quiz-progress
  .quiz-progress(data-js-quiz-progress data-progress-counter='both')
    .quiz-progress__top
      +button({ type: 'prev', text: '', svgId: 'arrow-back' })(data-js-pagination-back)
      .quiz-progress__counter
        .quiz-progress__counter-wrap
          span.quiz-progress__counter-divider(data-js-progress-separator) Вопрос&nbsp;
          span(data-js-progress-current) 1
          span.quiz-progress__counter-divider(data-js-progress-separator) &nbsp;из&nbsp;
          span(data-js-progress-total)
          span.quiz-progress__counter-percent(data-js-progress-percent)
    .quiz-progress__bar
      .quiz-progress__bar-item(data-js-pagination-progress)
```

Слот для переноса обёртки в конкретный шаг:

```html
<div data-step>
  <div data-js-progress-slot></div>
</div>
```

Скрыть прогресс на шаге:

```html
<div data-step data-hide-progress="true">...</div>
```

## Важные нюансы

- **Скрытие через `hidden`.** Если у элемента в CSS задан `display`, он перебьёт атрибут `hidden`. Добавьте `[hidden] { display: none !important; }`.
- **Все разделители скрываются.** Класс собирает их через `querySelectorAll`, поэтому атрибут `data-js-progress-separator` можно ставить на любое количество элементов.
- **Остальные селекторы берут первый элемент.** `current`, `total`, `percent` и слот ищутся через `querySelector`.
- **Слот.** На шаге должен быть ровно один видимый элемент-слот. Адаптивные дубли для разных брейкпоинтов класс не проверяет, обёртка может уехать в скрытый.
- **Статичная структура.** Метка исходного места обёртки (комментарий-якорь) создаётся один раз. Если шаги будут добавляться или удаляться динамически, якорь придётся пересоздавать.
- **Нет `data-js-progress-percent`.** В режиме `both` проценты просто не покажутся, ошибки не будет.
- **Оформление процента.** Скобки или отступ удобнее делать в CSS, например `::before { content: '(' }` и `::after { content: ')' }`.
