// Класс ничего не решает сам за пределами своей DOM-зоны (обёртка прогресса, полоса, счётчик, кнопка назад) и не вызывает методы навигации напрямую — взаимодействие с QuizNavigation происходит только через координатора: update(step) вызывается им при каждой смене шага (видимость/слот/кнопка назад), updateProgressBar(current, total) — отдельно, координатор сам считает эти числа (с учётом возможных карточных под-шагов внутри страницы), этот класс их просто отображает. Единственное самостоятельное решение класса — РЕЖИМ СЧЁТЧИКА (параметр counter: 'fraction' → "1/17" или 'percent' → "6%"), который читается из разметки (или задаётся в конструкторе).

// Режим счётчика ПРОГРЕСС-БАРА: 'fraction' — "1/17", 'percent' — "6%", 'both' - оба.
// Назван counter, чтобы не путать с процентами ЛОАДЕРА (data-percent-loader) —
// у лоадера своё 0→100 за N мс, у бара — доля пройденных шагов.
// Источник: параметр counter в конструкторе, иначе data-progress-counter
// на обёртке [data-js-quiz-progress], иначе 'fraction'.
export const PROGRESS_COUNTER_FORMATS = ['fraction', 'percent', 'both'];

// Селектор обёртки вынесен в константу — его же читает сам класс,
// чтобы не дублировать строку селектора в двух местах.
export const PROGRESS_WRAPPER_SELECTOR = '[data-js-quiz-progress]';

export default class QuizProgressBar {
    #counter = 'fraction';
    #lastCurrent = 0;
    #lastTotal = 0;
    #hasNumbers = false;
    #boundBackHandler = null;

    constructor({
        progressElement = PROGRESS_WRAPPER_SELECTOR,
        progressBarSelector = '[data-js-pagination-progress]',
        backButtonSelector = '[data-js-pagination-back]',
        currentSelector = '[data-js-progress-current]',
        totalSelector = '[data-js-progress-total]',
        separatorSelector = '[data-js-progress-separator]',
        percentSelector = '[data-js-progress-percent]',
        slotSelector = '[data-js-progress-slot]',
        counter,
        onBackClick
    }) {

        this.slotSelector = slotSelector;
        this.onBackClick = onBackClick;



        // Общая обертка прогресс бара
        this.wrapper = document.querySelector(progressElement);
        this.isWrapper = !!this.wrapper;

        this.backButton = this.wrapper?.querySelector(backButtonSelector) ?? document.querySelector(backButtonSelector);

        // Event delegation для кнопки "Назад" — работает с любой кнопкой [data-js-pagination-back]
        // в текущем активном шаге (как в QuizValidation)
        this.#boundBackHandler = (evt) => {
            const backBtn = evt.target.closest(backButtonSelector);
            if (backBtn) {
                console.log('[QuizProgressBar] backButton clicked (delegated), calling onBackClick');
                this.onBackClick?.();
            }
        };
        document.addEventListener('click', this.#boundBackHandler);

        // Режим счётчика: явный параметр > data-progress-counter на обёртке > 'fraction'
        this.counter =
            counter ?? (this.wrapper?.dataset.progressCounter || 'fraction');

        if (!this.isWrapper) {
            console.info('No progress bar was found.');
            return;
        }

        this.bar = this.wrapper.querySelector(progressBarSelector);

        this.hasProgressBar = !!this.bar;



        this.currentElement = this.wrapper?.querySelector(currentSelector);
        this.totalElement = this.wrapper?.querySelector(totalSelector);
        this.separatorElements = this.wrapper
            ? Array.from(this.wrapper.querySelectorAll(separatorSelector))
            : [];
        this.percentElement = this.wrapper?.querySelector(percentSelector);

        // Запоминаем ИСХОДНОЕ место бара в DOM с помощью невидимой метки,
        // чтобы потом точно возвращать его именно сюда, а не в конец родителя
        if (this.wrapper) {
            // Предполагается, что структура шагов статична на всё время жизни страницы.
            // Если шаги станут добавляться/удаляться динамически — этот якорь может оказаться в отсоединённом от DOM узле, и его нужно будет пересоздавать при каждом обновлении списка шагов.
            this.defaultAnchor = document.createComment('quiz-progress-anchor');
            this.wrapper.after(this.defaultAnchor);
        }

    }
    // Видимость / слот — не зависит от чисел прогресса,
    // вызывается координатором при каждой смене ВЕРХНЕУРОВНЕВОГО шага
    update(step) {
        if (!this.isWrapper) return;

        this.#updateVisibility(step);
        this.#moveToCurrentSlot(step);
    }

    // Числа прогресса (сам бар: номер шага или ПРОЦЕНТ БАРА, не лоадера) — координатор сам вычисляет
    // current/total (учитывая карточные под-шаги внутри страницы, если есть)
    // и передаёт сюда готовые значения. Вызывается при смене ЛЮБОГО шага —
    // и верхнеуровневого, и карточного внутри текущей страницы.
    // Как именно числа подаются ('fraction' → "1/17" или 'percent' → "6%")
    // решает this.counter, единственный рендер — в #render().
    updateProgressBar(current, total) {
        if (!this.isWrapper) return;

        this.#render(current, total);
    }

    // Текущий режим счётчика. Задаётся при инициализации (параметр counter
    // или data-progress-counter) и, как правило, не меняется во время
    // работы — на случай смены режима "вживую" последний переданный
    // current/total запоминается, чтобы перерисовка не требовала
    // пересчёта у координатора.
    get counter() {
        return this.#counter;
    }

    set counter(value) {
        if (PROGRESS_COUNTER_FORMATS.includes(value)) {
            this.#counter = value;
            return;
        }

        console.warn(
            `QuizProgressBar: unknown progress counter "${value}", using "fraction".`,
        );
        this.#counter = 'fraction';
    }

    setCounter(value) {
        this.counter = value;

        if (this.isWrapper && this.#hasNumbers) {
            this.#render(this.#lastCurrent, this.#lastTotal);
        }
    }

    setBackButtonVisible(visible) {
      this.backButton?.classList.toggle('hidden', !visible);
    }

    #render(current, total) {
        this.#lastCurrent = current;
        this.#lastTotal = total;
        this.#hasNumbers = true;

        const percent = this.#percentOf(current, total);
        const percentText = `${Math.round(percent)}%`;

        const isPercent = this.#counter === 'percent';
        const isBoth = this.#counter === 'both';

        if (this.hasProgressBar) {
            this.bar.style.width = `${percent}%`;
        }

        // percent: в current лежит "6%"; fraction и both: номер шага
        if (this.currentElement) {
            this.currentElement.textContent = isPercent ? percentText : current;
        }

        if (this.totalElement) {
            this.totalElement.textContent = total;
            this.totalElement.hidden = isPercent;
        }

        // Скрываем ВСЕ разделители только в режиме percent
        this.separatorElements.forEach((el) => {
            el.hidden = isPercent;
        });

        // Отдельный процент показываем только в режиме both
        if (this.percentElement) {
            this.percentElement.textContent = percentText;
            this.percentElement.hidden = !isBoth;
        }
    }

    // Та же формула, что и для ширины полоски — чтобы число совпадало с её заполнением
    #percentOf(current, total) {
        const percent = total > 1 ? (current / total) * 100 : 100;
        return Math.min(100, Math.max(0, percent));
    }

    // Использует querySelector — берёт первый найденный элемент с slotSelector внутри шага.
    // Важно: на каждом шаге должен быть ровно один видимый элемент-слот в момент показа шага.
    // Если разметка шага содержит несколько кандидатов (например, адаптивные варианты для разных брейкпоинтов) — бар может уехать в скрытый вариант, класс это не проверяет.
    #moveToCurrentSlot(step) {
        const currentStepEl = step;
        const customSlot = currentStepEl?.querySelector(this.slotSelector);

        if (customSlot) {
            if (customSlot !== this.wrapper.parentElement) {
                customSlot.appendChild(this.wrapper);
            }
        } else if (this.defaultAnchor) {
            if (this.wrapper.previousSibling !== this.defaultAnchor) {
                this.defaultAnchor.after(this.wrapper);
            }
        }
    }

    #updateVisibility(step) {
        if (!this.wrapper) return;

        const currentStepEl = step;
        const shouldHide = currentStepEl?.dataset.hideProgress === 'true';

        this.wrapper.classList.toggle('quiz-progress--hidden', shouldHide);
    }
}