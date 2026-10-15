import {CONTINUE_BTN_SELECTOR} from './QuizValidation.js';

export default class QuizStepTimers{
  constructor({
    steps,
    behaviors = []}){

    this.steps = Array.from(steps);
    this.behaviors = behaviors; // список { match, handle }, переданный координатором
    this.activeTimers = [];
  }

  handleStepChange(newStep, prevStep) {
    // ФАЗА ВЫХОДА
    this.activeTimers.forEach((timerId) => clearTimeout(timerId));
    this.activeTimers = [];

    // ФАЗА ВХОДА — перебираем все поведения, что нам передали снаружи
    this.behaviors.forEach(({match, handle}) => {
      if(match(newStep)) {
        handle(newStep, this.#scheduleTimer);
      }
    });
  }

  // Единственное место, где вообще вызывается setTimeout —
  // любое поведение обязано ставить таймер только через это,
  // чтобы отмена при выходе со шага работала для ВСЕХ поведений одинаково
  #scheduleTimer = (cb, delay) => {
    const timerId = setTimeout(cb, delay);
    this.activeTimers.push(timerId);
  }
}