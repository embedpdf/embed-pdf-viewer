import { vi } from 'vitest';
import { LevelLogger, LogLevel, Logger } from './logger';

const LOG_SOURCE = 'TEST';
const LOG_CATEGORY = 'TEST';

describe('LevelLogger', () => {
  it('should call log function based on level', () => {
    const testLogger: Logger = {
      isEnabled: vi.fn().mockReturnValue(true),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      perf: vi.fn(),
    };

    const levelLogger = new LevelLogger(testLogger, LogLevel.Error);

    levelLogger.debug(LOG_SOURCE, LOG_CATEGORY);

    expect(testLogger.debug).toHaveBeenCalledTimes(0);

    levelLogger.error(LOG_SOURCE, LOG_CATEGORY);

    expect(testLogger.error).toHaveBeenCalledTimes(1);
    expect(testLogger.error).toHaveBeenCalledWith(LOG_SOURCE, LOG_CATEGORY);
  });
});
