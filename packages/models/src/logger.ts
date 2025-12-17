/**
 * logger for logging
 *
 * @public
 */
export interface Logger {
  /**
   * Check if a log level is enabled
   * @param level - log level to check
   * @returns true if the level is enabled
   *
   * @public
   */
  isEnabled: (level: 'debug' | 'info' | 'warn' | 'error') => boolean;

  /**
   * Log debug message
   * @param source - source of log
   * @param category - category of log
   * @param args - parameters of log
   * @returns
   *
   * @public
   */
  debug: (source: string, category: string, ...args: any) => void;

  /**
   * Log infor message
   * @param source - source of log
   * @param category - category of log
   * @param args - parameters of log
   * @returns
   *
   * @public
   */
  info: (source: string, category: string, ...args: any) => void;

  /**
   * Log warning message
   * @param source - source of log
   * @param category - category of log
   * @param args - parameters of log
   * @returns
   *
   * @public
   */
  warn: (source: string, category: string, ...args: any) => void;
  /**
   * Log error message
   * @param source - source of log
   * @param category - category of log
   * @param args - parameters of log
   * @returns
   *
   * @public
   */
  error: (source: string, category: string, ...args: any) => void;

  /**
   * Log performance log
   * @param source - source of log
   * @param category - category of log
   * @param event - event of log
   * @param phase - event phase of log
   * @param args - parameters of log
   * @returns
   *
   * @public
   */
  perf: (
    source: string,
    category: string,
    event: string,
    phase: 'Begin' | 'End',
    ...args: any
  ) => void;
}

/**
 * Logger that log nothing, it will ignore all the logs
 *
 * @public
 */
export class NoopLogger implements Logger {
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(): boolean {
    return false;
  }

  /** {@inheritDoc Logger.debug} */
  debug() {}
  /** {@inheritDoc Logger.info} */
  info() {}
  /** {@inheritDoc Logger.warn} */
  warn() {}
  /** {@inheritDoc Logger.error} */
  error() {}
  /** {@inheritDoc Logger.perf} */
  perf() {}
}

/**
 * Logger that use console as the output
 *
 * @public
 */
export class ConsoleLogger implements Logger {
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(): boolean {
    return true;
  }

  /** {@inheritDoc Logger.debug} */
  debug(source: string, category: string, ...args: any) {
    console.debug(`${source}.${category}`, ...args);
  }

  /** {@inheritDoc Logger.info} */
  info(source: string, category: string, ...args: any) {
    console.info(`${source}.${category}`, ...args);
  }

  /** {@inheritDoc Logger.warn} */
  warn(source: string, category: string, ...args: any) {
    console.warn(`${source}.${category}`, ...args);
  }

  /** {@inheritDoc Logger.error} */
  error(source: string, category: string, ...args: any) {
    console.error(`${source}.${category}`, ...args);
  }

  /** {@inheritDoc Logger.perf} */
  perf(source: string, category: string, event: string, phase: 'Begin' | 'End', ...args: any) {
    console.info(`${source}.${category}.${event}.${phase}`, ...args);
  }
}

/**
 * Level of log
 *
 * @public
 */
export enum LogLevel {
  Debug = 0,
  Info,
  Warn,
  Error,
}

/**
 * Logger that support filtering by log level
 *
 * @public
 */
export class LevelLogger implements Logger {
  /**
   * create new LevelLogger
   * @param logger - the original logger
   * @param level - log level that used for filtering, all logs lower than this level will be filtered out
   */
  constructor(
    private logger: Logger,
    private level: LogLevel,
  ) {}

  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levelMap = {
      debug: LogLevel.Debug,
      info: LogLevel.Info,
      warn: LogLevel.Warn,
      error: LogLevel.Error,
    };
    return this.level <= levelMap[level];
  }

  /** {@inheritDoc Logger.debug} */
  debug(source: string, category: string, ...args: any) {
    if (this.level <= LogLevel.Debug) {
      this.logger.debug(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.info} */
  info(source: string, category: string, ...args: any) {
    if (this.level <= LogLevel.Info) {
      this.logger.info(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.warn} */
  warn(source: string, category: string, ...args: any) {
    if (this.level <= LogLevel.Warn) {
      this.logger.warn(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.error} */
  error(source: string, category: string, ...args: any) {
    if (this.level <= LogLevel.Error) {
      this.logger.error(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.perf} */
  perf(source: string, category: string, event: string, phase: 'Begin' | 'End', ...args: any) {
    this.logger.perf(source, category, event, phase, ...args);
  }
}

/**
 * Logger for performance tracking
 *
 * @public
 */
export class PerfLogger implements Logger {
  private marks: Map<string, number> = new Map();

  /**
   * create new PerfLogger
   */
  constructor() {}

  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(): boolean {
    return false;
  }

  /** {@inheritDoc Logger.debug} */
  debug(source: string, category: string, ...args: any) {}

  /** {@inheritDoc Logger.info} */
  info(source: string, category: string, ...args: any) {}

  /** {@inheritDoc Logger.warn} */
  warn(source: string, category: string, ...args: any) {}

  /** {@inheritDoc Logger.error} */
  error(source: string, category: string, ...args: any) {}

  /** {@inheritDoc Logger.perf} */
  perf(
    source: string,
    category: string,
    event: string,
    phase: 'Begin' | 'End',
    identifier: string,
    ...args: any
  ) {
    const markName = `${source}.${category}.${event}.${phase}.${identifier}`;

    switch (phase) {
      case 'Begin':
        globalThis.performance.mark(markName, { detail: args });
        this.marks.set(`${source}.${category}.${event}.${identifier}`, Date.now());
        break;
      case 'End':
        globalThis.performance.mark(markName, { detail: args });
        const measureName = `${source}.${category}.${event}.Measure.${identifier}`;
        const beginMark = `${source}.${category}.${event}.Begin.${identifier}`;

        globalThis.performance.measure(measureName, beginMark, markName);

        // Log duration to console
        const startTime = this.marks.get(`${source}.${category}.${event}.${identifier}`);
        if (startTime) {
          const duration = Date.now() - startTime;
          console.info(`⏱️ ${source}.${category}.${event}.${identifier}: ${duration}ms`);
          this.marks.delete(`${source}.${category}.${event}.${identifier}`);
        }
        break;
    }
  }
}

/**
 * Logger that will track and call child loggers
 *
 * @public
 */
export class AllLogger implements Logger {
  /**
   * create new PerfLogger
   */
  constructor(private loggers: Logger[]) {}

  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    return this.loggers.some((logger) => logger.isEnabled(level));
  }

  /** {@inheritDoc Logger.debug} */
  debug(source: string, category: string, ...args: any) {
    for (const logger of this.loggers) {
      logger.debug(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.info} */
  info(source: string, category: string, ...args: any) {
    for (const logger of this.loggers) {
      logger.info(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.warn} */
  warn(source: string, category: string, ...args: any) {
    for (const logger of this.loggers) {
      logger.warn(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.error} */
  error(source: string, category: string, ...args: any) {
    for (const logger of this.loggers) {
      logger.error(source, category, ...args);
    }
  }

  /** {@inheritDoc Logger.perf} */
  perf(source: string, category: string, event: string, phase: 'Begin' | 'End', ...args: any) {
    for (const logger of this.loggers) {
      logger.perf(source, category, event, phase, ...args);
    }
  }
}
