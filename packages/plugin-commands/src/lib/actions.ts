import { Action } from '@embedpdf/core';

export const REGISTER_COMMAND = 'COMMANDS/REGISTER';
export const UNREGISTER_COMMAND = 'COMMANDS/UNREGISTER';
export const MARK_COMMANDS_CHANGED = 'COMMANDS/MARK_CHANGED';
export const CLEAR_CHANGED_COMMANDS = 'COMMANDS/CLEAR_CHANGED';

export interface RegisterCommandAction extends Action {
  type: typeof REGISTER_COMMAND;
  payload: string; // commandId
}

export interface UnregisterCommandAction extends Action {
  type: typeof UNREGISTER_COMMAND;
  payload: string; // commandId
}

export interface MarkCommandsChangedAction extends Action {
  type: typeof MARK_COMMANDS_CHANGED;
  payload: string[]; // commandIds
}

export interface ClearChangedCommandsAction extends Action {
  type: typeof CLEAR_CHANGED_COMMANDS;
}

export type CommandsAction =
  | RegisterCommandAction
  | UnregisterCommandAction
  | MarkCommandsChangedAction
  | ClearChangedCommandsAction;

export const registerCommand = (commandId: string): RegisterCommandAction => ({
  type: REGISTER_COMMAND,
  payload: commandId,
});

export const unregisterCommand = (commandId: string): UnregisterCommandAction => ({
  type: UNREGISTER_COMMAND,
  payload: commandId,
});

export const markCommandsChanged = (commandIds: string[]): MarkCommandsChangedAction => ({
  type: MARK_COMMANDS_CHANGED,
  payload: commandIds,
});

export const clearChangedCommands = (): ClearChangedCommandsAction => ({
  type: CLEAR_CHANGED_COMMANDS,
});
