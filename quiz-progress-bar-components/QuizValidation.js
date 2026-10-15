const CONTINUE_BTN_SELECTOR = ".button__type-next";

export default class QuizValidation {
  constructor({ steps, onAdvance, advancedDelay = 200 }) {
    this.steps = Array.from(steps);
    this.onAdvance = onAdvance;
    this.advancedDelay = advancedDelay;
    this.advanceTimerId = null;

    this.#resetInputs();
    this.#initButtonState();
    document.addEventListener("change", this.#handleChange);
    document.addEventListener("click", this.#handleClick);
    document.addEventListener("pointerdown", this.#handlePointerDown);
  }

  handleStepChange() {
    this.#cancelPendingAdvance();
  }

  reset() {
    this.#cancelPendingAdvance();
    this.#resetInputs();
    this.#initButtonState();
  }

  #cancelPendingAdvance() {
    if (this.advanceTimerId !== null) {
      clearTimeout(this.advanceTimerId);
      this.advanceTimerId = null;
    }
  }

  #scheduleAdvance() {
    this.#cancelPendingAdvance();

    this.advanceTimerId = setTimeout(() => {
      this.advanceTimerId = null;
      this.onAdvance?.();
    }, this.advancedDelay);
  }

  /** Валидация одной группы инпутов */
  #validateGroupInputs(group) {
    const inputs = this.#getGroupInputs(group);

    if (!inputs.length) return true;

    const min = Number(group.dataset.minSelect ?? 1);
    const max = Number(group.dataset.maxSelect ?? 1);
    const checkedCount = [...inputs].filter((input) => input.checked).length;

    if (min > max) {
      console.warn(
        "Минимальное значение не может быть больше, чем максимально",
      );

      return false;
    }

    return checkedCount >= min && checkedCount <= max;
  }

  /** Если max === 1 и это checkbox — эмулируем поведение radio внутри группы */
  #setSingleSelect(group, changedInput) {
    const max = Number(group.dataset.maxSelect ?? 1);
    if (max !== 1 || changedInput.type !== "checkbox" || !changedInput.checked)
      return;

    this.#getGroupInputs(group).forEach((input) => {
      if (input !== changedInput) input.checked = false;
    });
  }

  /** Если max > 1 — не даём отметить больше, чем разрешено */
  #setMaxLimit(group, changedInput) {
    const max = Number(group.dataset.maxSelect ?? 1);
    if (max <= 1 || changedInput.type !== "checkbox" || !changedInput.checked)
      return;

    const inputs = [...this.#getGroupInputs(group)];
    const checked = inputs.filter((input) => input.checked);
    if (checked.length > max) changedInput.checked = false;
  }

  /** Валидация всего шага = валидны ВСЕ его группы (или сам шаг, если групп нет) */
  #validateQuizStep(step) {
    const groups = step.querySelectorAll("[data-js-quiz-group]");

    if (!groups.length) {
      const inputs = this.#getGroupInputs(step);

      if (!inputs.length) return true;

      const min = Number(step.dataset.minSelect ?? 1);
      const max = Number(step.dataset.maxSelect ?? 1);
      const checkedCount = [...inputs].filter((i) => i.checked).length;

      if (min > max) {
        console.warn("Min value is less than max value", min, max);
        return false;
      }
      return checkedCount >= min && checkedCount <= max;
    }

    return [...groups].every((group) => this.#validateGroupInputs(group));
  }

  /** Обновление состояния кнопки продолжения */
  #updateContinueButton(step) {
    if (step.dataset.externalValidation === "true") return;
    const btn = step.querySelector(CONTINUE_BTN_SELECTOR);

    if (!btn) return;

    const result = this.#validateQuizStep(step);
    btn.disabled = !result;
  }

  #handleChange = (evt) => {
    const markedEl = evt.target.closest("[data-js-quiz-input]");
    if (!markedEl) return;

    const input = evt.target;
    const group = input.closest("[data-js-quiz-group]");
    const step = input.closest("[data-js-quiz-step], [data-js-quiz-card]");

    if (!step) return;

    if (group) {
      this.#setSingleSelect(group, input);
      this.#setMaxLimit(group, input);
    }

    this.#updateContinueButton(step);

    // Автопереход, если шаг это разрешает и валидация прошла
    if (step.dataset.autoAdvance === "true" && this.#validateQuizStep(step)) {
      this.#scheduleAdvance();
    }
  };

  #findQuizInput(target) {
    // Случай 1 — клик пришёлся прямо на инпут (или на элемент внутри
    // него/его обёртки, являющейся предком инпута в DOM)
    const direct = target.closest("[data-js-quiz-input]");
    if (direct) return direct;

    // Случай 2 — клик пришёлся на что-то внутри <label for="...">,
    // не являющееся предком инпута (например, соседний <span> с текстом)
    const label = target.closest("label[for]");
    if (!label) return null;

    const related = document.getElementById(label.getAttribute("for"));
    if (related && related.matches("[data-js-quiz-input]")) {
      return related;
    }

    return null;
  }

  #inputStateBeforeClick = new WeakMap();

  #handlePointerDown = (evt) => {
    const input = this.#findQuizInput(evt.target);
    if (!input) return;

    this.#inputStateBeforeClick.set(input, input.checked);
  };

  #handleClick = (evt) => {
    // Ветка 1 — клик по кнопке "далее", без изменений
    const continueBtn = evt.target.closest(CONTINUE_BTN_SELECTOR);
    if (continueBtn) {
      this.onAdvance?.();
      return;
    }

    // Ветка 2 - кнопка пропустить
    const skipButton = evt.target.closest("[data-js-quiz-skip]");
    if (skipButton) {
      this.onAdvance?.();
      return;
    }

    // Реагируем только на клик, чей target — сам нативный контрол.
    // Клик по обёртке (label/текст/иконка) всегда порождает ВТОРОЕ,
    // синтетическое click-событие с target = input — вот его и обрабатываем,
    // это исключает двойную обработку одного физического клика.
    if (!evt.target.matches("input, select, textarea")) return;

    const markedEl = evt.target.closest("[data-js-quiz-input]");
    if (!markedEl) return;

    const wasCheckedBefore = this.#inputStateBeforeClick.get(evt.target);

    if (wasCheckedBefore === evt.target.checked) {
      const step = evt.target.closest(
        "[data-js-quiz-step], [data-js-quiz-card]",
      );
      if (!step) return;

      if (step.dataset.autoAdvance === "true" && this.#validateQuizStep(step)) {
        this.#scheduleAdvance();
      }
    }
  };

  #resetInputs() {
    const inputs = this.steps.flatMap((step) => [
      ...this.#getGroupInputs(step),
    ]);

    inputs.forEach((input) => {
      input.checked = false;
    });
  }

  #initButtonState() {
    this.steps.forEach((step) => {
      this.#updateContinueButton(step);
    });
  }

  #resolveNativeInput(el) {
    if (!el) return null;

    if (el.matches("input, select, textarea")) return el;

    return el.querySelector("input, select, textarea");
  }

  #getGroupInputs(container) {
    return [...container.querySelectorAll("[data-js-quiz-input]")]
      .map((marked) => this.#resolveNativeInput(marked))
      .filter(Boolean);
  }
}

export { CONTINUE_BTN_SELECTOR };
