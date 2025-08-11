export class LogClass {
  constructor(verbose, prefix) {
    this.verbose = verbose;
    this.prefix = prefix;
  }

  log(message) {
    if (!this.verbose) return;
    // eslint-disable-next-line no-console
    console.log(`[${this.prefix}] ${message}`);
  }
}
