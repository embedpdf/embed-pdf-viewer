import { vi } from 'vitest';
import { Task, TaskError, TaskStage } from './task';

describe('Task', () => {
  test('should has pending state by default', () => {
    const task = new Task();
    expect(task.state.stage).toBe(TaskStage.Pending);
  });

  test('resolve should update state to resolved and call resolved callback', () => {
    const task = new Task<string, string>();
    const resolved = vi.fn();
    const rejected = vi.fn();
    task.wait(resolved, rejected);
    task.resolve('hello');
    expect(task.state.stage).toBe(TaskStage.Resolved);
    // @ts-expect-error ignore type check in test
    expect(task.state.result).toBe('hello');
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveBeenCalledWith('hello');
    expect(rejected).not.toHaveBeenCalled();
  });

  test('reject should update state to rejected and call rejected callback', () => {
    const task = new Task<string, string>();
    const resolved = vi.fn();
    const rejected = vi.fn();
    task.wait(resolved, rejected);
    const reason = 'hello';
    task.reject(reason);
    expect(task.state.stage).toBe(TaskStage.Rejected);
    // @ts-expect-error ignore type check in test0
    expect(task.state.reason).toBe('hello');
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith({ type: 'reject', reason });
    expect(resolved).not.toHaveBeenCalled();
  });

  test('abort should update state to aborted and call rejected callback', () => {
    const task = new Task<string, string>();
    const resolved = vi.fn();
    const rejected = vi.fn();
    task.wait(resolved, rejected);
    const reason = 'hello';
    task.abort(reason);
    expect(task.state.stage).toBe(TaskStage.Aborted);
    // @ts-expect-error ignore type check in test0
    expect(task.state.reason).toBe('hello');
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith({ type: 'abort', reason });
    expect(resolved).not.toHaveBeenCalled();
  });
});
