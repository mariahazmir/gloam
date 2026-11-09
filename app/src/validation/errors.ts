/** Thrown for NaN, infinite or out-of-range input. The message starts with the argument name. */
export class ArgumentError extends Error {
  constructor(
    public readonly argument: string,
    detail: string,
  ) {
    super(`${argument}: ${detail}`);
    this.name = 'ArgumentError';
  }
}
