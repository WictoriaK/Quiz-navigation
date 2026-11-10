import QuizValidation, {
  CONTINUE_BTN_SELECTOR,
} from "./quiz-progress-bar-components/QuizValidation.js";
import QuizNavigation from "./quiz-progress-bar-components/QuizNavigation.js";
import QuizProgressBar from "./quiz-progress-bar-components/QuizProgressBar.js";
import QuizStepTimers from "./quiz-progress-bar-components/QuizStepTimers.js";
import { startLoader } from "../loader.js";

export default class QuizCoordinator {
  #trackedSteps = null;
  #quizNavigation = null;
  #quizProgressBar = null;
  #quizValidation = null;
  #quizTimers = null;
  #activeCardStack = null;
  #stages = []; // [{ title, weight }]
  #stageOf = new Map(); // страница -> номер её этапа

  constructor({ steps }) {
    this.steps = Array.from(steps);
  }

  init() {
    // Отслеживаемые страницы верхнего уровня (без data-hide-progress) —
    // используются для расчёта общего прогресса с учётом карточных под-шагов
    this.#trackedSteps = this.steps.filter(
      (step) => step.dataset.hideProgress !== "true",
    );

    this.#buildStages();

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
      {
        match: (step) => !!step.dataset.loader,
        handle: (step, schedule) => {
          schedule(() => {
            startLoader();
          }, 100);
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
    // Страницы с data-hide-progress ничего не меняют: блок скрыт, значения
    // остаются как на последнем учитываемом шаге (и нет скачка 29/29 на старте)
    if (!this.#stageOf.has(newStep)) return;

    const { current, total } = this.#computeProgress(newStep);
    this.#quizProgressBar.updateProgressBar(current, total);

    const stage = this.#computeStage(newStep);
    if (stage) this.#quizProgressBar.updateStages(stage);
  }

  #computeProgress(newStep) {
    let total = 0;
    let current = 0;
    let passedCurrent = false;

    this.#trackedSteps.forEach((step) => {
      const weight = this.#getWeight(step);
      total += weight;

      if (step === newStep) {
        passedCurrent = true;
        current += this.#activeCardStack
          ? this.#activeCardStack.currentIndex + 1
          : 1;
      } else if (!passedCurrent) {
        current += weight;
      }
    });

    return { current, total };
  }

  #getWeight(step) {
    const container = step.querySelector("[data-js-card-container]");
    return container
      ? container.querySelectorAll("[data-js-quiz-card]").length
      : 1;
  }

  #buildStages() {
    this.#stages = [];
    this.#stageOf = new Map();

    this.#trackedSteps.forEach((step, i) => {
      // новый этап: у первой страницы всегда, дальше там, где есть атрибут
      // (hasAttribute, а не значение: пустой атрибут тоже начинает этап)
      if (i === 0 || step.hasAttribute("data-progress-stage")) {
        this.#stages.push({
          title: step.dataset.progressStage || "",
          weight: 0,
        });
      }

      const stageIndex = this.#stages.length - 1;
      this.#stages[stageIndex].weight += this.#getWeight(step);
      this.#stageOf.set(step, stageIndex);
    });
  }

  #computeStage(newStep) {
    const stageIndex = this.#stageOf.get(newStep);
    if (stageIndex === undefined) return null; // страница не учитывается

    let done = 0;
    for (const step of this.#trackedSteps) {
      if (this.#stageOf.get(step) !== stageIndex) continue;

      if (step === newStep) {
        // текущая страница: номер карточки или 1
        done += this.#activeCardStack
          ? this.#activeCardStack.currentIndex + 1
          : 1;
        break;
      }
      done += this.#getWeight(step); // страницы этапа до текущей пройдены целиком
    }

    const { title, weight } = this.#stages[stageIndex];

    return {
      index: stageIndex,
      count: this.#stages.length,
      fill: (done / weight) * 100,
      title,
    };
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

    if (page.dataset.hideBack === "true") {
      visible = false; // шаги, где кнопка не нужна
    } else if (this.#activeCardStack && !this.#activeCardStack.isFirstStep) {
      visible = true; // назад можно на предыдущую карточку
    } else {
      visible = !this.#quizNavigation.isFirstStep; // иначе на предыдущую страницу
    }

    this.#quizProgressBar.setBackButtonVisible(visible);
  }

  #syncUI(step) {
    this.#updateProgress(step);
    this.#updateBackButton();
  }
}
