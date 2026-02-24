import { Reducer, Action, StoreState, StoreListener, PluginListener } from './types';
import { PluginStore } from './plugin-store';
import { CORE_ACTION_TYPES } from './actions';

/**
 * A generic, type-safe store class managing core and plugin states, reducers, and subscriptions.
 * @template CoreState The type of the core state.
 * @template CoreAction The type of actions handled by core reducers (extends Action).
 */
export class Store<CoreState, CoreAction extends Action = Action> {
  private state: StoreState<CoreState>;
  private coreReducer: Reducer<CoreState, CoreAction>;
  private pluginReducers: Record<string, Reducer<any, Action>> = {};

  private listeners: StoreListener<CoreState>[] = [];
  private pluginListeners: Record<string, PluginListener[]> = {};

  // Prevents re-entrant dispatch during reducer execution (like Redux)
  private isDispatching = false;

  /**
   * Initializes the store with the provided core state.
   * @param reducer          The core reducer function
   * @param initialCoreState The initial core state
   */
  constructor(
    reducer: Reducer<CoreState, CoreAction>,
    public initialCoreState: CoreState,
  ) {
    this.state = { core: initialCoreState, plugins: {} };
    this.coreReducer = reducer;
  }

  /**
   * Adds a reducer for a plugin-specific state.
   * @param pluginId The unique identifier for the plugin.
   * @param reducer The reducer function for the plugin state.
   * @param initialState The initial state for the plugin.
   */
  addPluginReducer<PluginState>(
    pluginId: string,
    reducer: Reducer<PluginState, Action>,
    initialState: PluginState,
  ) {
    this.state.plugins[pluginId] = initialState;
    this.pluginReducers[pluginId] = reducer;
  }

  /**
   * Dispatches an action *only* to the core reducer.
   * Notifies the global store listeners with (action, newState, oldState).
   *
   * @param action The action to dispatch, typed as CoreAction
   * @returns The updated *global* store state
   */
  dispatchToCore(action: CoreAction): StoreState<CoreState> {
    if (!this.coreReducer) {
      return this.getState();
    }

    if (this.isDispatching) {
      throw new Error(
        'Reducers may not dispatch actions. ' +
          'To trigger cascading actions, dispatch from a listener callback instead.',
      );
    }

    const oldState = this.getState();

    try {
      this.isDispatching = true;
      // Update core state via its reducer
      this.state.core = this.coreReducer(this.state.core, action);
    } finally {
      // Always reset flag, even if reducer throws
      this.isDispatching = false;
    }

    // Notify all main-store subscribers (can now safely dispatch)
    // Get fresh state for each listener to handle nested dispatches correctly
    this.listeners.forEach((listener) => {
      const currentState = this.getState(); // Fresh snapshot for each listener
      listener(action, currentState, oldState);
    });

    return this.getState();
  }

  /**
   * Dispatches an action *only* to a specific plugin.
   * Optionally notifies global store listeners if `notifyGlobal` is true.
   * Always notifies plugin-specific listeners with (action, newPluginState, oldPluginState).
   *
   * @param pluginId   The plugin identifier
   * @param action     The plugin action to dispatch
   * @param notifyGlobal Whether to also notify global store listeners
   * @returns The updated plugin state
   */
  dispatchToPlugin<PluginAction extends Action>(
    pluginId: string,
    action: PluginAction,
    notifyGlobal: boolean = true,
  ): any {
    if (this.isDispatching) {
      throw new Error(
        'Reducers may not dispatch actions. ' +
          'To trigger cascading actions, dispatch from a listener callback instead.',
      );
    }

    const oldGlobalState = this.getState();

    const reducer = this.pluginReducers[pluginId];
    if (!reducer) {
      // No plugin found, just return the old state
      return oldGlobalState.plugins[pluginId];
    }

    // Grab the old plugin state
    const oldPluginState = oldGlobalState.plugins[pluginId];

    try {
      this.isDispatching = true;
      // Reduce to new plugin state
      const newPluginState = reducer(oldPluginState, action);
      // Update the store's plugin slice
      this.state.plugins[pluginId] = newPluginState;
    } finally {
      this.isDispatching = false;
    }

    // Notify listeners (can now safely dispatch)
    // Get fresh state for each listener to handle nested dispatches correctly
    if (notifyGlobal) {
      this.listeners.forEach((listener) => {
        const currentGlobalState = this.getState(); // Fresh snapshot for each listener
        listener(action, currentGlobalState, oldGlobalState);
      });
    }

    // Notify plugin-specific listeners
    // Get fresh plugin state for each listener
    if (this.pluginListeners[pluginId]) {
      this.pluginListeners[pluginId].forEach((listener) => {
        const currentPluginState = this.getState().plugins[pluginId]; // Fresh snapshot for each listener
        listener(action, currentPluginState, oldPluginState);
      });
    }

    return this.getState().plugins[pluginId];
  }

  /**
   * Dispatches an action to update the state using:
   * - the core reducer (if it's a CoreAction)
   * - *all* plugin reducers (regardless of action type), with no global notify for each plugin
   *
   * Returns the new *global* store state after all reducers have processed the action.
   *
   * @param action The action to dispatch (can be CoreAction or any Action).
   */
  dispatch(action: CoreAction | Action): StoreState<CoreState> {
    if (this.isDispatching) {
      throw new Error(
        'Reducers may not dispatch actions. ' +
          'To trigger cascading actions, dispatch from a listener callback instead.',
      );
    }

    const oldState = this.getState();

    try {
      this.isDispatching = true;

      // 1) Apply core reducer (only if action is a CoreAction)
      if (this.isCoreAction(action)) {
        this.state.core = this.coreReducer(this.state.core, action);
      }

      // 2) Apply plugin reducers (without globally notifying after each plugin)
      for (const pluginId in this.pluginReducers) {
        const reducer = this.pluginReducers[pluginId];
        const oldPluginState = oldState.plugins[pluginId];
        if (reducer) {
          this.state.plugins[pluginId] = reducer(oldPluginState, action);
        }
      }
    } finally {
      this.isDispatching = false;
    }

    // 3) Notify global listeners *once* with the final new state (can now safely dispatch)
    // Get fresh state for each listener to handle nested dispatches correctly
    this.listeners.forEach((listener) => {
      const currentState = this.getState(); // Fresh snapshot for each listener
      listener(action, currentState, oldState);
    });

    // 4) Return the new global store state
    return this.getState();
  }

  /**
   * Returns a shallow copy of the current state.
   * @returns The current store state.
   */
  getState(): StoreState<CoreState> {
    if (this.isDispatching) {
      throw new Error(
        'You may not call store.getState() while the reducer is executing. ' +
          'The reducer has already received the state as an argument. ' +
          'Pass it down from the top reducer instead of reading it from the store.',
      );
    }

    return {
      core: { ...this.state.core },
      plugins: { ...this.state.plugins },
    };
  }

  /**
   * Subscribes a listener to *global* state changes.
   * The callback signature is now (action, newState, oldState).
   *
   * @param listener The callback to invoke on state changes
   * @returns A function to unsubscribe the listener
   */
  subscribe(listener: StoreListener<CoreState>) {
    if (this.isDispatching) {
      throw new Error(
        'You may not call store.subscribe() while the reducer is executing. ' +
          'If you would like to be notified after the store has been updated, subscribe from a ' +
          'component and invoke store.getState() in the callback to access the latest state.',
      );
    }

    this.listeners.push(listener);
    return () => {
      if (this.isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing.',
        );
      }
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribes a listener to *plugin-specific* state changes.
   * The callback signature is now (action, newPluginState, oldPluginState).
   *
   * @param pluginId The unique identifier for the plugin.
   * @param listener The callback to invoke on plugin state changes.
   * @returns A function to unsubscribe the listener.
   */
  subscribeToPlugin(pluginId: string, listener: PluginListener) {
    if (!(pluginId in this.state.plugins)) {
      throw new Error(
        `Plugin state not found for plugin "${pluginId}". Did you forget to call addPluginReducer?`,
      );
    }

    if (this.isDispatching) {
      throw new Error('You may not call store.subscribeToPlugin() while the reducer is executing.');
    }

    if (!this.pluginListeners[pluginId]) {
      this.pluginListeners[pluginId] = [];
    }
    this.pluginListeners[pluginId].push(listener);

    return () => {
      if (this.isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing.',
        );
      }
      this.pluginListeners[pluginId] = this.pluginListeners[pluginId].filter((l) => l !== listener);
      if (this.pluginListeners[pluginId].length === 0) {
        delete this.pluginListeners[pluginId];
      }
    };
  }

  /**
   * Subscribes to a specific action type (only from the core's action union).
   * The callback signature is (action, newState, oldState).
   *
   * @param type The action type to listen for.
   * @param handler The callback to invoke when the action occurs.
   * @returns A function to unsubscribe the handler.
   */
  onAction<T extends CoreAction['type']>(
    type: T,
    handler: (
      action: Extract<CoreAction, { type: T }>,
      state: StoreState<CoreState>,
      oldState: StoreState<CoreState>,
    ) => void,
  ) {
    return this.subscribe((action, newState, oldState) => {
      if (action.type === type) {
        handler(action as Extract<CoreAction, { type: T }>, newState, oldState);
      }
    });
  }

  /**
   * Gets a PluginStore handle for a specific plugin.
   * @param pluginId The unique identifier for the plugin.
   * @returns A PluginStore instance for the plugin.
   */
  getPluginStore<PluginState, PluginAction extends Action>(
    pluginId: string,
  ): PluginStore<PluginState, PluginAction> {
    if (!(pluginId in this.state.plugins)) {
      throw new Error(
        `Plugin state not found for plugin "${pluginId}". Did you forget to call addPluginReducer?`,
      );
    }
    return new PluginStore<PluginState, PluginAction>(this, pluginId);
  }

  /**
   * Helper method to check if an action is a CoreAction.
   * Adjust if you have a more refined way to differentiate CoreAction vs. any other Action.
   */
  public isCoreAction(action: Action): action is CoreAction {
    return CORE_ACTION_TYPES.includes(action.type as (typeof CORE_ACTION_TYPES)[number]);
  }

  /**
   * Destroy the store: drop every listener and plugin reducer
   */
  public destroy(): void {
    // 1. empty listener collections
    this.listeners.length = 0;
    for (const id in this.pluginListeners) {
      this.pluginListeners[id]?.splice?.(0);
    }
    this.pluginListeners = {};

    // 2. wipe plugin reducers and states
    this.pluginReducers = {};
    this.state.plugins = {};

    // 3. reset core state to initial
    this.state.core = { ...this.initialCoreState };
  }
}
