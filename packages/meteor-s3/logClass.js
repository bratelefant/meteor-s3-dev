export class LogClass {
  constructor(verbose, prefix) {
    this.verbose = verbose;
    this.prefix = prefix;
  }

  log(message) {
    if (!this.verbose) return;
    console.log(`[${this.prefix}] ${message}`);
  }
}
