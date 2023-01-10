export class FrontNotSetupError extends Error {
  constructor() {
    super("Did you forget to run `front.js setup` for your platform?");
  }
}

throw new FrontNotSetupError();
