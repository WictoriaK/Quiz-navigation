export default class QuizNavigation {
  constructor({ steps, onStepChange }) {
    if (!steps || steps.length === 0) {
      throw new Error(
        "No Quiz steps found. HTML markup should have at least one element",
      );
    }

    // Безопасно преобразуем в массив, если пришел NodeList
    this.steps = Array.from(steps);

    this.activeStep = this.steps.filter((step) =>
      step.classList.contains("active"),
    );

    if (!this.activeStep || this.activeStep.length === 0) {
      throw new Error(
        "No active quiz steps found. HTML markup should have at least one active element",
      );
    }

    if (this.activeStep.length > 1) {
      throw new Error(
        "Several active quiz steps were found. HTML markup should have only one active element",
      );
    }

    this.totalSteps = this.steps.length;
    this.currentIndex = this.steps.indexOf(this.activeStep[0]);
    this.onStepChange = onStepChange;
  }

  nextStep() {
    if (this.totalSteps === 0) {
      console.warn(
        "No Quiz steps found. HTML markup should have at least one active element",
      );
      return;
    }

    if (!(this.currentIndex < this.totalSteps - 1)) return;

    const nextStep = this.currentIndex + 1;

    this.#activateStep(nextStep);
  }

  goBack() {
    if (this.totalSteps === 0) {
      console.warn(
        "No Quiz steps found. HTML markup should have at least one active element",
      );
      return;
    }

    if (this.currentIndex <= 0) return;

    let prevStepIndex = this.currentIndex - 1;

    while (
      prevStepIndex > 0 &&
      this.steps[prevStepIndex].dataset.skipOnBack === "true"
    ) {
      prevStepIndex--;
    }

    this.#activateStep(prevStepIndex);
  }

  goTo(index) {
    if (this.totalSteps === 0) {
      console.warn(
        "No Quiz steps found. HTML markup should have at least one active element",
      );
      return;
    }

    if (index >= 0 && index < this.totalSteps) {
      this.#activateStep(index);
    }
  }

  #activateStep(index) {
    const currentStep = this.steps[this.currentIndex]; // при goBack становится preStep
    const newStep = this.steps[index];

    currentStep.classList.remove("active");
    newStep.classList.add("active");

    this.currentIndex = index;

    this.onStepChange?.(newStep, currentStep);
  }

  get currentStep() {
    return this.steps[this.currentIndex];
  }

  get isFirstStep() {
    return this.currentIndex === 0;
  }

  get isLastStep() {
    return this.currentIndex === this.totalSteps - 1;
  }
}
