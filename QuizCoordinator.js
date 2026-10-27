import QuizValidation, {
  CONTINUE_BTN_SELECTOR,
} from "./quiz-progress-bar-components/QuizValidation.js";
import QuizNavigation from "./quiz-progress-bar-components/QuizNavigation.js";
import QuizProgressBar from "./quiz-progress-bar-components/QuizProgressBar.js";
import QuizStepTimers from "./quiz-progress-bar-components/QuizStepTimers.js";

export default class QuizCoordinator {
  #trackedSteps = null;
  #quizNavigation = null;
  #quizProgressBar = null;
  #quizValidation = null;
  #quizTimers = null;
  #activeCardStack = null;

  constructor({ steps }) {
    this.steps = Array.from(steps);
  }

  init() {
    // Отслеживаемые страницы верхнего уровня (без data-hide-progress) —
    // используются для расчёта общего прогресса с учётом карточных под-шагов
    this.#trackedSteps = this.steps.filter(
      (step) => step.dataset.hideProgress !== "true",
    );

    this.#quizNavigation = new QuizNavigation({
      steps: this.steps,
      onStepChange: (newStep, prevStep) => {
        const wasGoingBack = prevStep
          ? this.steps.indexOf(newStep) < this.steps.indexOf(prevStep)
          : false;

        this.#activeCardStack = this.#getCardStackFor(newStep);

        if (this.#activeCardStack && wasGoingBack) {
          const lastIndex = this.#activeCardStack.totalSteps - 1;
          this.#activeCardStack.goTo(lastIndex);
        }

        this.#quizProgressBar.update(newStep);
        this.#syncUI(newStep);

        this.#quizTimers.handleStepChange(newStep, prevStep);
        this.#quizValidation.handleStepChange();
        this.#scrollToTop();
      },
    });

    const behaviors = [
      // 1. Разблокировка кнопки через N мс
      {
        match: (step) => !!step.dataset.unlockAfter,
        handle: (step, schedule) => {
          const delay = Number(step.dataset.unlockAfter);
          const btn = step.querySelector(CONTINUE_BTN_SELECTOR);

          if (btn && delay) {
            schedule(() => {
              btn.disabled = false;
            }, delay);
          }
        },
      },

      // 2. Авто-переход на следующий шаг через N мс
      {
        match: (step) => !!step.dataset.autoTimer,
        handle: (step, schedule) => {
          const delay = Number(step.dataset.autoTimer);

          if (delay) {
            schedule(() => {
              this.#advance();
            }, delay);
          }
        },
      },

      // 3. Последовательная анимация отметки чекбоксов
      {
        match: (step) => !!step.querySelector("[data-js-auto-check]"),
        handle: (step, schedule) => {
          const list = step.querySelector("[data-js-auto-check]");
          const interval = Number(list.dataset.checkInterval) || 600;
          const checkboxes = [...list.querySelectorAll("input[type=checkbox]")];

          checkboxes.forEach((checkbox, index) => {
            checkbox.checked = false;

            schedule(
              () => {
                checkbox.checked = true;
              },
              interval * (index + 1),
            );
          });
        },
      },
    ];

    this.#quizProgressBar = new QuizProgressBar({
      onBackClick: () => this.#goBack(),
    });

    this.#quizValidation = new QuizValidation({
      steps: this.steps,
      onAdvance: () => this.#advance(),
    });

    this.#quizTimers = new QuizStepTimers({
      steps: this.steps,
      behaviors,
    });

    // Довызовы стартового состояния — onStepChange не срабатывает при
    // инициализации, только на реальных переходах, поэтому все модули
    // нужно вручную "подвести" под текущий (стартовый) активный шаг
    this.#activeCardStack = this.#getCardStackFor(
      this.#quizNavigation.currentStep,
    );

    this.#quizProgressBar.update(this.#quizNavigation.currentStep);
    this.#syncUI(this.#quizNavigation.currentStep);
    this.#quizTimers.handleStepChange(this.#quizNavigation.currentStep, null);

    document.addEventListener("click", (evt) => {
      const restartBtn = evt.target.closest("[data-js-quiz-restart]");
      if (!restartBtn) return;

      this.#quizNavigation.goTo(0);
      this.#activeCardStack?.goTo(0);
      this.#quizValidation.reset();
    });
  }

  // Ищет контейнер карточек ВНУТРИ конкретной страницы (не document!).
  // Возвращает null, если у страницы нет карточек — обычная страница квиза.
  #getCardStackFor(step) {
    const cardContainer = step.querySelector("[data-js-card-container]");
    if (!cardContainer) return null;

    const cards = cardContainer.querySelectorAll("[data-js-quiz-card]");
    if (!cards.length) return null;

    return new QuizNavigation({
      steps: cards,
      onStepChange: (newCard, prevCard) => {
        this.#syncUI(step);
      },
    });
  }

  // Единая точка перехода "далее" — решает, куда именно идти:
  // внутрь карточного стека текущей страницы, если он есть и не закончился,
  // либо на следующую страницу квиза целиком.
  #advance() {
    if (this.#activeCardStack && !this.#activeCardStack.isLastStep) {
      this.#activeCardStack.nextStep();
      return;
    }

    this.#quizNavigation.nextStep();
  }

  // Симметрично #advance() — для кнопки "назад".
  #goBack() {
    if (this.#activeCardStack && !this.#activeCardStack.isFirstStep) {
      this.#activeCardStack.goBack();
      return;
    }

    this.#quizNavigation.goBack();
  }

  // Пересчитывает current/total с учётом того, что страница с карточками
  // весит столько же, сколько в ней карточек, а не 1 — и передаёт готовые
  // числа в QuizProgressBar, которая сама ничего не вычисляет.
  #updateProgress(newStep) {
    const { current, total } = this.#computeProgress(newStep);
    this.#quizProgressBar.updateProgressBar(current, total);
  }

  #computeProgress(newStep) {
    let total = 0;
    let current = 0;
    let passedCurrent = false;

    this.#trackedSteps.forEach((step) => {
      const cardContainer = step.querySelector("[data-js-card-container]");
      const cardCount = cardContainer
        ? cardContainer.querySelectorAll("[data-js-quiz-card]").length
        : 1;

      total += cardCount;

      if (step === newStep) {
        passedCurrent = true;
        // позиция внутри текущей страницы: номер карточки, либо просто 1
        current += this.#activeCardStack
          ? this.#activeCardStack.currentIndex + 1
          : 1;
      } else if (!passedCurrent) {
        current += cardCount; // страница пройдена целиком
      }
    });

    return { current, total };
  }

  #scrollEnabled = true;

  #scrollToTop() {
    if (!this.#scrollEnabled) return;

    requestAnimationFrame(() => {
      const scrollTarget =
        document.scrollingElement || document.documentElement;
      scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  enableScroll() {
    this.#scrollEnabled = true;
  }

  disableScroll() {
    this.#scrollEnabled = false;
  }

  #updateBackButton() {
    const page = this.#quizNavigation.currentStep;

    let visible;

    if (page.dataset.hideBack === 'true') {
      visible = false;                                   // шаги, где кнопка не нужна
    } else if (this.#activeCardStack && !this.#activeCardStack.isFirstStep) {
      visible = true;                                    // назад можно на предыдущую карточку
    } else {
      visible = !this.#quizNavigation.isFirstStep;       // иначе на предыдущую страницу
    }

    this.#quizProgressBar.setBackButtonVisible(visible);
  }

  #syncUI(step) {
    this.#updateProgress(step);
    this.#updateBackButton();
  }
}
