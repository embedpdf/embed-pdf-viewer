import{s as r,W as o}from"./2PxcrNm-.js";function i(t,n){const e=new Worker(URL.createObjectURL(new Blob([`var Rotation = /* @__PURE__ */ ((Rotation2) => {
  Rotation2[Rotation2["Degree0"] = 0] = "Degree0";
  Rotation2[Rotation2["Degree90"] = 1] = "Degree90";
  Rotation2[Rotation2["Degree180"] = 2] = "Degree180";
  Rotation2[Rotation2["Degree270"] = 3] = "Degree270";
  return Rotation2;
})(Rotation || {});
function toIntPos(p) {
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}
function toIntSize(s) {
  return { width: Math.ceil(s.width), height: Math.ceil(s.height) };
}
function toIntRect(r) {
  return {
    origin: toIntPos(r.origin),
    size: toIntSize(r.size)
  };
}
function swap(size) {
  const { width, height } = size;
  return {
    width: height,
    height: width
  };
}
function quadToRect(q) {
  const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x];
  const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y];
  return {
    origin: { x: Math.min(...xs), y: Math.min(...ys) },
    size: {
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    }
  };
}
function rectToQuad(r) {
  return {
    p1: { x: r.origin.x, y: r.origin.y },
    p2: { x: r.origin.x + r.size.width, y: r.origin.y },
    p3: { x: r.origin.x + r.size.width, y: r.origin.y + r.size.height },
    p4: { x: r.origin.x, y: r.origin.y + r.size.height }
  };
}
function rotateRect(containerSize, rect, rotation) {
  let x = rect.origin.x;
  let y = rect.origin.y;
  let size = rect.size;
  switch (rotation) {
    case 0:
      break;
    case 1:
      x = containerSize.height - rect.origin.y - rect.size.height;
      y = rect.origin.x;
      size = swap(rect.size);
      break;
    case 2:
      x = containerSize.width - rect.origin.x - rect.size.width;
      y = containerSize.height - rect.origin.y - rect.size.height;
      break;
    case 3:
      x = rect.origin.y;
      y = containerSize.width - rect.origin.x - rect.size.width;
      size = swap(rect.size);
      break;
  }
  return {
    origin: {
      x,
      y
    },
    size: {
      width: size.width,
      height: size.height
    }
  };
}
function scaleRect(rect, scaleFactor) {
  return {
    origin: {
      x: rect.origin.x * scaleFactor,
      y: rect.origin.y * scaleFactor
    },
    size: {
      width: rect.size.width * scaleFactor,
      height: rect.size.height * scaleFactor
    }
  };
}
function transformRect(containerSize, rect, rotation, scaleFactor) {
  return scaleRect(rotateRect(containerSize, rect, rotation), scaleFactor);
}
function buildUserToDeviceMatrix(rect, rotation, outW, outH) {
  const L = rect.origin.x;
  const B = rect.origin.y;
  const W = rect.size.width;
  const H = rect.size.height;
  const sx0 = outW / W;
  const sy0 = outH / H;
  const sx90 = outW / H;
  const sy90 = outH / W;
  switch (rotation) {
    case 0:
      return { a: sx0, b: 0, c: 0, d: sy0, e: -sx0 * L, f: -sy0 * B };
    case 3:
      return { a: 0, b: -sy90, c: sx90, d: 0, e: -sx90 * B, f: sy90 * (L + W) };
    case 2:
      return { a: -sx0, b: 0, c: 0, d: -sy0, e: sx0 * (L + W), f: sy0 * (B + H) };
    case 1:
      return { a: 0, b: sy90, c: -sx90, d: 0, e: sx90 * (B + H), f: -sy90 * L };
  }
}
class NoopLogger {
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled() {
    return false;
  }
  /** {@inheritDoc Logger.debug} */
  debug() {
  }
  /** {@inheritDoc Logger.info} */
  info() {
  }
  /** {@inheritDoc Logger.warn} */
  warn() {
  }
  /** {@inheritDoc Logger.error} */
  error() {
  }
  /** {@inheritDoc Logger.perf} */
  perf() {
  }
}
class ConsoleLogger {
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled() {
    return true;
  }
  /** {@inheritDoc Logger.debug} */
  debug(source, category, ...args) {
    console.debug(\`\${source}.\${category}\`, ...args);
  }
  /** {@inheritDoc Logger.info} */
  info(source, category, ...args) {
    console.info(\`\${source}.\${category}\`, ...args);
  }
  /** {@inheritDoc Logger.warn} */
  warn(source, category, ...args) {
    console.warn(\`\${source}.\${category}\`, ...args);
  }
  /** {@inheritDoc Logger.error} */
  error(source, category, ...args) {
    console.error(\`\${source}.\${category}\`, ...args);
  }
  /** {@inheritDoc Logger.perf} */
  perf(source, category, event, phase, ...args) {
    console.info(\`\${source}.\${category}.\${event}.\${phase}\`, ...args);
  }
}
class LevelLogger {
  /**
   * create new LevelLogger
   * @param logger - the original logger
   * @param level - log level that used for filtering, all logs lower than this level will be filtered out
   */
  constructor(logger, level) {
    this.logger = logger;
    this.level = level;
  }
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(level) {
    const levelMap = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
      /* Error */
    };
    return this.level <= levelMap[level];
  }
  /** {@inheritDoc Logger.debug} */
  debug(source, category, ...args) {
    if (this.level <= 0) {
      this.logger.debug(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.info} */
  info(source, category, ...args) {
    if (this.level <= 1) {
      this.logger.info(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.warn} */
  warn(source, category, ...args) {
    if (this.level <= 2) {
      this.logger.warn(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.error} */
  error(source, category, ...args) {
    if (this.level <= 3) {
      this.logger.error(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.perf} */
  perf(source, category, event, phase, ...args) {
    this.logger.perf(source, category, event, phase, ...args);
  }
}
class PerfLogger {
  /**
   * create new PerfLogger
   */
  constructor() {
  }
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled() {
    return false;
  }
  /** {@inheritDoc Logger.debug} */
  debug(source, category, ...args) {
  }
  /** {@inheritDoc Logger.info} */
  info(source, category, ...args) {
  }
  /** {@inheritDoc Logger.warn} */
  warn(source, category, ...args) {
  }
  /** {@inheritDoc Logger.error} */
  error(source, category, ...args) {
  }
  /** {@inheritDoc Logger.perf} */
  perf(source, category, event, phase, identifier, ...args) {
    switch (phase) {
      case "Begin":
        globalThis.performance.mark(\`\${source}.\${category}.\${event}.\${phase}.\${identifier}\`, {
          detail: args
        });
        break;
      case "End":
        globalThis.performance.mark(\`\${source}.\${category}.\${event}.\${phase}.\${identifier}\`, {
          detail: args
        });
        globalThis.performance.measure(
          \`\${source}.\${category}.\${event}.Measure.\${identifier}\`,
          \`\${source}.\${category}.\${event}.Begin.\${identifier}\`,
          \`\${source}.\${category}.\${event}.End.\${identifier}\`
        );
        break;
    }
  }
}
class AllLogger {
  /**
   * create new PerfLogger
   */
  constructor(loggers) {
    this.loggers = loggers;
  }
  /** {@inheritDoc Logger.isEnabled} */
  isEnabled(level) {
    return this.loggers.some((logger) => logger.isEnabled(level));
  }
  /** {@inheritDoc Logger.debug} */
  debug(source, category, ...args) {
    for (const logger of this.loggers) {
      logger.debug(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.info} */
  info(source, category, ...args) {
    for (const logger of this.loggers) {
      logger.info(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.warn} */
  warn(source, category, ...args) {
    for (const logger of this.loggers) {
      logger.warn(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.error} */
  error(source, category, ...args) {
    for (const logger of this.loggers) {
      logger.error(source, category, ...args);
    }
  }
  /** {@inheritDoc Logger.perf} */
  perf(source, category, event, phase, ...args) {
    for (const logger of this.loggers) {
      logger.perf(source, category, event, phase, ...args);
    }
  }
}
class TaskAbortedError extends Error {
  constructor(reason) {
    super(\`Task aborted: \${JSON.stringify(reason)}\`);
    this.name = "TaskAbortedError";
    this.reason = reason;
  }
}
class TaskRejectedError extends Error {
  constructor(reason) {
    super(\`Task rejected: \${JSON.stringify(reason)}\`);
    this.name = "TaskRejectedError";
    this.reason = reason;
  }
}
class Task {
  constructor() {
    this.state = {
      stage: 0
      /* Pending */
    };
    this.resolvedCallbacks = [];
    this.rejectedCallbacks = [];
    this._promise = null;
    this.progressCbs = [];
  }
  /**
   * Convert task to promise
   * @returns promise that will be resolved when task is settled
   */
  toPromise() {
    if (!this._promise) {
      this._promise = new Promise((resolve, reject) => {
        this.wait(
          (result) => resolve(result),
          (error) => {
            if (error.type === "abort") {
              reject(new TaskAbortedError(error.reason));
            } else {
              reject(new TaskRejectedError(error.reason));
            }
          }
        );
      });
    }
    return this._promise;
  }
  /**
   * wait for task to be settled
   * @param resolvedCallback - callback for resolved value
   * @param rejectedCallback - callback for rejected value
   */
  wait(resolvedCallback, rejectedCallback) {
    switch (this.state.stage) {
      case 0:
        this.resolvedCallbacks.push(resolvedCallback);
        this.rejectedCallbacks.push(rejectedCallback);
        break;
      case 1:
        resolvedCallback(this.state.result);
        break;
      case 2:
        rejectedCallback({
          type: "reject",
          reason: this.state.reason
        });
        break;
      case 3:
        rejectedCallback({
          type: "abort",
          reason: this.state.reason
        });
        break;
    }
  }
  /**
   * resolve task with specific result
   * @param result - result value
   */
  resolve(result) {
    if (this.state.stage === 0) {
      this.state = {
        stage: 1,
        result
      };
      for (const resolvedCallback of this.resolvedCallbacks) {
        try {
          resolvedCallback(result);
        } catch (e) {
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }
  /**
   * reject task with specific reason
   * @param reason - abort reason
   *
   */
  reject(reason) {
    if (this.state.stage === 0) {
      this.state = {
        stage: 2,
        reason
      };
      for (const rejectedCallback of this.rejectedCallbacks) {
        try {
          rejectedCallback({
            type: "reject",
            reason
          });
        } catch (e) {
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }
  /**
   * abort task with specific reason
   * @param reason - abort reason
   */
  abort(reason) {
    if (this.state.stage === 0) {
      this.state = {
        stage: 3,
        reason
      };
      for (const rejectedCallback of this.rejectedCallbacks) {
        try {
          rejectedCallback({
            type: "abort",
            reason
          });
        } catch (e) {
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }
  /**
   * fail task with a TaskError from another task
   * This is a convenience method for error propagation between tasks
   * @param error - TaskError from another task
   */
  fail(error) {
    if (error.type === "abort") {
      this.abort(error.reason);
    } else {
      this.reject(error.reason);
    }
  }
  /**
   * add a progress callback
   * @param cb - progress callback
   */
  onProgress(cb) {
    this.progressCbs.push(cb);
  }
  /**
   * call progress callback
   * @param p - progress value
   */
  progress(p) {
    for (const cb of this.progressCbs) cb(p);
  }
  /**
   * Static method to wait for all tasks to resolve
   * Returns a new task that resolves with an array of all results
   * Rejects immediately if any task fails
   *
   * @param tasks - array of tasks to wait for
   * @returns new task that resolves when all input tasks resolve
   * @public
   */
  static all(tasks) {
    const combinedTask = new Task();
    if (tasks.length === 0) {
      combinedTask.resolve([]);
      return combinedTask;
    }
    const results = new Array(tasks.length);
    let resolvedCount = 0;
    let isSettled = false;
    tasks.forEach((task, index) => {
      task.wait(
        (result) => {
          if (isSettled) return;
          results[index] = result;
          resolvedCount++;
          if (resolvedCount === tasks.length) {
            isSettled = true;
            combinedTask.resolve(results);
          }
        },
        (error) => {
          if (isSettled) return;
          isSettled = true;
          if (error.type === "abort") {
            combinedTask.abort(error.reason);
          } else {
            combinedTask.reject(error.reason);
          }
        }
      );
    });
    return combinedTask;
  }
  /**
   * Static method to wait for all tasks to settle (resolve, reject, or abort)
   * Always resolves with an array of settlement results
   *
   * @param tasks - array of tasks to wait for
   * @returns new task that resolves when all input tasks settle
   * @public
   */
  static allSettled(tasks) {
    const combinedTask = new Task();
    if (tasks.length === 0) {
      combinedTask.resolve([]);
      return combinedTask;
    }
    const results = new Array(tasks.length);
    let settledCount = 0;
    tasks.forEach((task, index) => {
      task.wait(
        (result) => {
          results[index] = { status: "resolved", value: result };
          settledCount++;
          if (settledCount === tasks.length) {
            combinedTask.resolve(results);
          }
        },
        (error) => {
          results[index] = {
            status: error.type === "abort" ? "aborted" : "rejected",
            reason: error.reason
          };
          settledCount++;
          if (settledCount === tasks.length) {
            combinedTask.resolve(results);
          }
        }
      );
    });
    return combinedTask;
  }
  /**
   * Static method that resolves/rejects with the first task that settles
   *
   * @param tasks - array of tasks to race
   * @returns new task that settles with the first input task that settles
   * @public
   */
  static race(tasks) {
    const combinedTask = new Task();
    if (tasks.length === 0) {
      combinedTask.reject("No tasks provided");
      return combinedTask;
    }
    let isSettled = false;
    tasks.forEach((task) => {
      task.wait(
        (result) => {
          if (isSettled) return;
          isSettled = true;
          combinedTask.resolve(result);
        },
        (error) => {
          if (isSettled) return;
          isSettled = true;
          if (error.type === "abort") {
            combinedTask.abort(error.reason);
          } else {
            combinedTask.reject(error.reason);
          }
        }
      );
    });
    return combinedTask;
  }
  /**
   * Utility to track progress of multiple tasks
   *
   * @param tasks - array of tasks to track
   * @param onProgress - callback called when any task completes
   * @returns new task that resolves when all input tasks resolve
   * @public
   */
  static withProgress(tasks, onProgress) {
    const combinedTask = Task.all(tasks);
    if (onProgress) {
      let completedCount = 0;
      tasks.forEach((task) => {
        task.wait(
          () => {
            completedCount++;
            onProgress(completedCount, tasks.length);
          },
          () => {
            completedCount++;
            onProgress(completedCount, tasks.length);
          }
        );
      });
    }
    return combinedTask;
  }
}
const PdfSoftHyphenMarker = "­";
const PdfZeroWidthSpace = "​";
const PdfWordJoiner = "⁠";
const PdfBomOrZwnbsp = "\\uFEFF";
const PdfNonCharacterFFFE = "￾";
const PdfNonCharacterFFFF = "￿";
const PdfUnwantedTextMarkers = Object.freeze([
  PdfSoftHyphenMarker,
  PdfZeroWidthSpace,
  PdfWordJoiner,
  PdfBomOrZwnbsp,
  PdfNonCharacterFFFE,
  PdfNonCharacterFFFF
]);
const PdfUnwantedTextRegex = new RegExp(\`[\${PdfUnwantedTextMarkers.join("")}]\`, "g");
function stripPdfUnwantedMarkers(text) {
  return text.replace(PdfUnwantedTextRegex, "");
}
var PdfZoomMode = /* @__PURE__ */ ((PdfZoomMode2) => {
  PdfZoomMode2[PdfZoomMode2["Unknown"] = 0] = "Unknown";
  PdfZoomMode2[PdfZoomMode2["XYZ"] = 1] = "XYZ";
  PdfZoomMode2[PdfZoomMode2["FitPage"] = 2] = "FitPage";
  PdfZoomMode2[PdfZoomMode2["FitHorizontal"] = 3] = "FitHorizontal";
  PdfZoomMode2[PdfZoomMode2["FitVertical"] = 4] = "FitVertical";
  PdfZoomMode2[PdfZoomMode2["FitRectangle"] = 5] = "FitRectangle";
  PdfZoomMode2[PdfZoomMode2["FitBoundingBox"] = 6] = "FitBoundingBox";
  PdfZoomMode2[PdfZoomMode2["FitBoundingBoxHorizontal"] = 7] = "FitBoundingBoxHorizontal";
  PdfZoomMode2[PdfZoomMode2["FitBoundingBoxVertical"] = 8] = "FitBoundingBoxVertical";
  return PdfZoomMode2;
})(PdfZoomMode || {});
var PdfTrappedStatus = /* @__PURE__ */ ((PdfTrappedStatus2) => {
  PdfTrappedStatus2[PdfTrappedStatus2["NotSet"] = 0] = "NotSet";
  PdfTrappedStatus2[PdfTrappedStatus2["True"] = 1] = "True";
  PdfTrappedStatus2[PdfTrappedStatus2["False"] = 2] = "False";
  PdfTrappedStatus2[PdfTrappedStatus2["Unknown"] = 3] = "Unknown";
  return PdfTrappedStatus2;
})(PdfTrappedStatus || {});
var PdfStandardFont = /* @__PURE__ */ ((PdfStandardFont2) => {
  PdfStandardFont2[PdfStandardFont2["Unknown"] = -1] = "Unknown";
  PdfStandardFont2[PdfStandardFont2["Courier"] = 0] = "Courier";
  PdfStandardFont2[PdfStandardFont2["Courier_Bold"] = 1] = "Courier_Bold";
  PdfStandardFont2[PdfStandardFont2["Courier_BoldOblique"] = 2] = "Courier_BoldOblique";
  PdfStandardFont2[PdfStandardFont2["Courier_Oblique"] = 3] = "Courier_Oblique";
  PdfStandardFont2[PdfStandardFont2["Helvetica"] = 4] = "Helvetica";
  PdfStandardFont2[PdfStandardFont2["Helvetica_Bold"] = 5] = "Helvetica_Bold";
  PdfStandardFont2[PdfStandardFont2["Helvetica_BoldOblique"] = 6] = "Helvetica_BoldOblique";
  PdfStandardFont2[PdfStandardFont2["Helvetica_Oblique"] = 7] = "Helvetica_Oblique";
  PdfStandardFont2[PdfStandardFont2["Times_Roman"] = 8] = "Times_Roman";
  PdfStandardFont2[PdfStandardFont2["Times_Bold"] = 9] = "Times_Bold";
  PdfStandardFont2[PdfStandardFont2["Times_BoldItalic"] = 10] = "Times_BoldItalic";
  PdfStandardFont2[PdfStandardFont2["Times_Italic"] = 11] = "Times_Italic";
  PdfStandardFont2[PdfStandardFont2["Symbol"] = 12] = "Symbol";
  PdfStandardFont2[PdfStandardFont2["ZapfDingbats"] = 13] = "ZapfDingbats";
  return PdfStandardFont2;
})(PdfStandardFont || {});
var PdfTextAlignment = /* @__PURE__ */ ((PdfTextAlignment2) => {
  PdfTextAlignment2[PdfTextAlignment2["Left"] = 0] = "Left";
  PdfTextAlignment2[PdfTextAlignment2["Center"] = 1] = "Center";
  PdfTextAlignment2[PdfTextAlignment2["Right"] = 2] = "Right";
  return PdfTextAlignment2;
})(PdfTextAlignment || {});
var PdfBlendMode = /* @__PURE__ */ ((PdfBlendMode2) => {
  PdfBlendMode2[PdfBlendMode2["Normal"] = 0] = "Normal";
  PdfBlendMode2[PdfBlendMode2["Multiply"] = 1] = "Multiply";
  PdfBlendMode2[PdfBlendMode2["Screen"] = 2] = "Screen";
  PdfBlendMode2[PdfBlendMode2["Overlay"] = 3] = "Overlay";
  PdfBlendMode2[PdfBlendMode2["Darken"] = 4] = "Darken";
  PdfBlendMode2[PdfBlendMode2["Lighten"] = 5] = "Lighten";
  PdfBlendMode2[PdfBlendMode2["ColorDodge"] = 6] = "ColorDodge";
  PdfBlendMode2[PdfBlendMode2["ColorBurn"] = 7] = "ColorBurn";
  PdfBlendMode2[PdfBlendMode2["HardLight"] = 8] = "HardLight";
  PdfBlendMode2[PdfBlendMode2["SoftLight"] = 9] = "SoftLight";
  PdfBlendMode2[PdfBlendMode2["Difference"] = 10] = "Difference";
  PdfBlendMode2[PdfBlendMode2["Exclusion"] = 11] = "Exclusion";
  PdfBlendMode2[PdfBlendMode2["Hue"] = 12] = "Hue";
  PdfBlendMode2[PdfBlendMode2["Saturation"] = 13] = "Saturation";
  PdfBlendMode2[PdfBlendMode2["Color"] = 14] = "Color";
  PdfBlendMode2[PdfBlendMode2["Luminosity"] = 15] = "Luminosity";
  return PdfBlendMode2;
})(PdfBlendMode || {});
var PdfStampFit = /* @__PURE__ */ ((PdfStampFit2) => {
  PdfStampFit2[PdfStampFit2["Contain"] = 0] = "Contain";
  PdfStampFit2[PdfStampFit2["Cover"] = 1] = "Cover";
  PdfStampFit2[PdfStampFit2["Stretch"] = 2] = "Stretch";
  return PdfStampFit2;
})(PdfStampFit || {});
var PdfActionType = /* @__PURE__ */ ((PdfActionType2) => {
  PdfActionType2[PdfActionType2["Unsupported"] = 0] = "Unsupported";
  PdfActionType2[PdfActionType2["Goto"] = 1] = "Goto";
  PdfActionType2[PdfActionType2["RemoteGoto"] = 2] = "RemoteGoto";
  PdfActionType2[PdfActionType2["URI"] = 3] = "URI";
  PdfActionType2[PdfActionType2["LaunchAppOrOpenFile"] = 4] = "LaunchAppOrOpenFile";
  return PdfActionType2;
})(PdfActionType || {});
var PdfAnnotationSubtype = /* @__PURE__ */ ((PdfAnnotationSubtype2) => {
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["UNKNOWN"] = 0] = "UNKNOWN";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["TEXT"] = 1] = "TEXT";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["LINK"] = 2] = "LINK";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["FREETEXT"] = 3] = "FREETEXT";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["LINE"] = 4] = "LINE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["SQUARE"] = 5] = "SQUARE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["CIRCLE"] = 6] = "CIRCLE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["POLYGON"] = 7] = "POLYGON";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["POLYLINE"] = 8] = "POLYLINE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["HIGHLIGHT"] = 9] = "HIGHLIGHT";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["UNDERLINE"] = 10] = "UNDERLINE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["SQUIGGLY"] = 11] = "SQUIGGLY";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["STRIKEOUT"] = 12] = "STRIKEOUT";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["STAMP"] = 13] = "STAMP";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["CARET"] = 14] = "CARET";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["INK"] = 15] = "INK";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["POPUP"] = 16] = "POPUP";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["FILEATTACHMENT"] = 17] = "FILEATTACHMENT";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["SOUND"] = 18] = "SOUND";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["MOVIE"] = 19] = "MOVIE";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["WIDGET"] = 20] = "WIDGET";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["SCREEN"] = 21] = "SCREEN";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["PRINTERMARK"] = 22] = "PRINTERMARK";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["TRAPNET"] = 23] = "TRAPNET";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["WATERMARK"] = 24] = "WATERMARK";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["THREED"] = 25] = "THREED";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["RICHMEDIA"] = 26] = "RICHMEDIA";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["XFAWIDGET"] = 27] = "XFAWIDGET";
  PdfAnnotationSubtype2[PdfAnnotationSubtype2["REDACT"] = 28] = "REDACT";
  return PdfAnnotationSubtype2;
})(PdfAnnotationSubtype || {});
var AppearanceMode = /* @__PURE__ */ ((AppearanceMode2) => {
  AppearanceMode2[AppearanceMode2["Normal"] = 0] = "Normal";
  AppearanceMode2[AppearanceMode2["Rollover"] = 1] = "Rollover";
  AppearanceMode2[AppearanceMode2["Down"] = 2] = "Down";
  return AppearanceMode2;
})(AppearanceMode || {});
var PdfAnnotationIcon = /* @__PURE__ */ ((PdfAnnotationIcon2) => {
  PdfAnnotationIcon2[PdfAnnotationIcon2["Unknown"] = -1] = "Unknown";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Comment"] = 0] = "Comment";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Key"] = 1] = "Key";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Note"] = 2] = "Note";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Help"] = 3] = "Help";
  PdfAnnotationIcon2[PdfAnnotationIcon2["NewParagraph"] = 4] = "NewParagraph";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Paragraph"] = 5] = "Paragraph";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Insert"] = 6] = "Insert";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Graph"] = 7] = "Graph";
  PdfAnnotationIcon2[PdfAnnotationIcon2["PushPin"] = 8] = "PushPin";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Paperclip"] = 9] = "Paperclip";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Tag"] = 10] = "Tag";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Speaker"] = 11] = "Speaker";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Mic"] = 12] = "Mic";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Approved"] = 13] = "Approved";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Experimental"] = 14] = "Experimental";
  PdfAnnotationIcon2[PdfAnnotationIcon2["NotApproved"] = 15] = "NotApproved";
  PdfAnnotationIcon2[PdfAnnotationIcon2["AsIs"] = 16] = "AsIs";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Expired"] = 17] = "Expired";
  PdfAnnotationIcon2[PdfAnnotationIcon2["NotForPublicRelease"] = 18] = "NotForPublicRelease";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Confidential"] = 19] = "Confidential";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Final"] = 20] = "Final";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Sold"] = 21] = "Sold";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Departmental"] = 22] = "Departmental";
  PdfAnnotationIcon2[PdfAnnotationIcon2["ForComment"] = 23] = "ForComment";
  PdfAnnotationIcon2[PdfAnnotationIcon2["TopSecret"] = 24] = "TopSecret";
  PdfAnnotationIcon2[PdfAnnotationIcon2["Draft"] = 25] = "Draft";
  PdfAnnotationIcon2[PdfAnnotationIcon2["ForPublicRelease"] = 26] = "ForPublicRelease";
  return PdfAnnotationIcon2;
})(PdfAnnotationIcon || {});
var PdfAnnotationLineEnding = /* @__PURE__ */ ((PdfAnnotationLineEnding2) => {
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["None"] = 0] = "None";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Square"] = 1] = "Square";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Circle"] = 2] = "Circle";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Diamond"] = 3] = "Diamond";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["OpenArrow"] = 4] = "OpenArrow";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["ClosedArrow"] = 5] = "ClosedArrow";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Butt"] = 6] = "Butt";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["ROpenArrow"] = 7] = "ROpenArrow";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["RClosedArrow"] = 8] = "RClosedArrow";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Slash"] = 9] = "Slash";
  PdfAnnotationLineEnding2[PdfAnnotationLineEnding2["Unknown"] = 10] = "Unknown";
  return PdfAnnotationLineEnding2;
})(PdfAnnotationLineEnding || {});
var PDF_FORM_FIELD_TYPE = /* @__PURE__ */ ((PDF_FORM_FIELD_TYPE2) => {
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["UNKNOWN"] = 0] = "UNKNOWN";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["PUSHBUTTON"] = 1] = "PUSHBUTTON";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["CHECKBOX"] = 2] = "CHECKBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["RADIOBUTTON"] = 3] = "RADIOBUTTON";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["COMBOBOX"] = 4] = "COMBOBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["LISTBOX"] = 5] = "LISTBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["TEXTFIELD"] = 6] = "TEXTFIELD";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["SIGNATURE"] = 7] = "SIGNATURE";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA"] = 8] = "XFA";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_CHECKBOX"] = 9] = "XFA_CHECKBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_COMBOBOX"] = 10] = "XFA_COMBOBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_IMAGEFIELD"] = 11] = "XFA_IMAGEFIELD";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_LISTBOX"] = 12] = "XFA_LISTBOX";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_PUSHBUTTON"] = 13] = "XFA_PUSHBUTTON";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_SIGNATURE"] = 14] = "XFA_SIGNATURE";
  PDF_FORM_FIELD_TYPE2[PDF_FORM_FIELD_TYPE2["XFA_TEXTFIELD"] = 15] = "XFA_TEXTFIELD";
  return PDF_FORM_FIELD_TYPE2;
})(PDF_FORM_FIELD_TYPE || {});
var PdfAnnotationColorType = /* @__PURE__ */ ((PdfAnnotationColorType2) => {
  PdfAnnotationColorType2[PdfAnnotationColorType2["Color"] = 0] = "Color";
  PdfAnnotationColorType2[PdfAnnotationColorType2["InteriorColor"] = 1] = "InteriorColor";
  return PdfAnnotationColorType2;
})(PdfAnnotationColorType || {});
var PdfAnnotationBorderStyle = /* @__PURE__ */ ((PdfAnnotationBorderStyle2) => {
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["UNKNOWN"] = 0] = "UNKNOWN";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["SOLID"] = 1] = "SOLID";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["DASHED"] = 2] = "DASHED";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["BEVELED"] = 3] = "BEVELED";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["INSET"] = 4] = "INSET";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["UNDERLINE"] = 5] = "UNDERLINE";
  PdfAnnotationBorderStyle2[PdfAnnotationBorderStyle2["CLOUDY"] = 6] = "CLOUDY";
  return PdfAnnotationBorderStyle2;
})(PdfAnnotationBorderStyle || {});
var PdfPageObjectType = /* @__PURE__ */ ((PdfPageObjectType2) => {
  PdfPageObjectType2[PdfPageObjectType2["UNKNOWN"] = 0] = "UNKNOWN";
  PdfPageObjectType2[PdfPageObjectType2["TEXT"] = 1] = "TEXT";
  PdfPageObjectType2[PdfPageObjectType2["PATH"] = 2] = "PATH";
  PdfPageObjectType2[PdfPageObjectType2["IMAGE"] = 3] = "IMAGE";
  PdfPageObjectType2[PdfPageObjectType2["SHADING"] = 4] = "SHADING";
  PdfPageObjectType2[PdfPageObjectType2["FORM"] = 5] = "FORM";
  return PdfPageObjectType2;
})(PdfPageObjectType || {});
const PdfAnnotationFlagName = Object.freeze({
  [
    1
    /* INVISIBLE */
  ]: "invisible",
  [
    2
    /* HIDDEN */
  ]: "hidden",
  [
    4
    /* PRINT */
  ]: "print",
  [
    8
    /* NO_ZOOM */
  ]: "noZoom",
  [
    16
    /* NO_ROTATE */
  ]: "noRotate",
  [
    32
    /* NO_VIEW */
  ]: "noView",
  [
    64
    /* READ_ONLY */
  ]: "readOnly",
  [
    128
    /* LOCKED */
  ]: "locked",
  [
    256
    /* TOGGLE_NOVIEW */
  ]: "toggleNoView"
});
const PdfAnnotationFlagValue = Object.entries(
  PdfAnnotationFlagName
).reduce(
  (acc, [bit, name]) => {
    acc[name] = Number(bit);
    return acc;
  },
  {}
);
function flagsToNames(raw) {
  return Object.keys(PdfAnnotationFlagName).filter((flag) => (raw & flag) !== 0).map((flag) => PdfAnnotationFlagName[flag]);
}
function namesToFlags(names) {
  return names.reduce(
    (mask, name) => mask | PdfAnnotationFlagValue[name],
    0
    /* NONE */
  );
}
var MatchFlag = /* @__PURE__ */ ((MatchFlag2) => {
  MatchFlag2[MatchFlag2["None"] = 0] = "None";
  MatchFlag2[MatchFlag2["MatchCase"] = 1] = "MatchCase";
  MatchFlag2[MatchFlag2["MatchWholeWord"] = 2] = "MatchWholeWord";
  MatchFlag2[MatchFlag2["MatchConsecutive"] = 4] = "MatchConsecutive";
  return MatchFlag2;
})(MatchFlag || {});
var PdfPageFlattenFlag = /* @__PURE__ */ ((PdfPageFlattenFlag2) => {
  PdfPageFlattenFlag2[PdfPageFlattenFlag2["Display"] = 0] = "Display";
  PdfPageFlattenFlag2[PdfPageFlattenFlag2["Print"] = 1] = "Print";
  return PdfPageFlattenFlag2;
})(PdfPageFlattenFlag || {});
var PdfErrorCode = /* @__PURE__ */ ((PdfErrorCode2) => {
  PdfErrorCode2[PdfErrorCode2["Ok"] = 0] = "Ok";
  PdfErrorCode2[PdfErrorCode2["Unknown"] = 1] = "Unknown";
  PdfErrorCode2[PdfErrorCode2["NotFound"] = 2] = "NotFound";
  PdfErrorCode2[PdfErrorCode2["WrongFormat"] = 3] = "WrongFormat";
  PdfErrorCode2[PdfErrorCode2["Password"] = 4] = "Password";
  PdfErrorCode2[PdfErrorCode2["Security"] = 5] = "Security";
  PdfErrorCode2[PdfErrorCode2["PageError"] = 6] = "PageError";
  PdfErrorCode2[PdfErrorCode2["XFALoad"] = 7] = "XFALoad";
  PdfErrorCode2[PdfErrorCode2["XFALayout"] = 8] = "XFALayout";
  PdfErrorCode2[PdfErrorCode2["Cancelled"] = 9] = "Cancelled";
  PdfErrorCode2[PdfErrorCode2["Initialization"] = 10] = "Initialization";
  PdfErrorCode2[PdfErrorCode2["NotReady"] = 11] = "NotReady";
  PdfErrorCode2[PdfErrorCode2["NotSupport"] = 12] = "NotSupport";
  PdfErrorCode2[PdfErrorCode2["LoadDoc"] = 13] = "LoadDoc";
  PdfErrorCode2[PdfErrorCode2["DocNotOpen"] = 14] = "DocNotOpen";
  PdfErrorCode2[PdfErrorCode2["CantCloseDoc"] = 15] = "CantCloseDoc";
  PdfErrorCode2[PdfErrorCode2["CantCreateNewDoc"] = 16] = "CantCreateNewDoc";
  PdfErrorCode2[PdfErrorCode2["CantImportPages"] = 17] = "CantImportPages";
  PdfErrorCode2[PdfErrorCode2["CantCreateAnnot"] = 18] = "CantCreateAnnot";
  PdfErrorCode2[PdfErrorCode2["CantSetAnnotRect"] = 19] = "CantSetAnnotRect";
  PdfErrorCode2[PdfErrorCode2["CantSetAnnotContent"] = 20] = "CantSetAnnotContent";
  PdfErrorCode2[PdfErrorCode2["CantRemoveInkList"] = 21] = "CantRemoveInkList";
  PdfErrorCode2[PdfErrorCode2["CantAddInkStoke"] = 22] = "CantAddInkStoke";
  PdfErrorCode2[PdfErrorCode2["CantReadAttachmentSize"] = 23] = "CantReadAttachmentSize";
  PdfErrorCode2[PdfErrorCode2["CantReadAttachmentContent"] = 24] = "CantReadAttachmentContent";
  PdfErrorCode2[PdfErrorCode2["CantFocusAnnot"] = 25] = "CantFocusAnnot";
  PdfErrorCode2[PdfErrorCode2["CantSelectText"] = 26] = "CantSelectText";
  PdfErrorCode2[PdfErrorCode2["CantSelectOption"] = 27] = "CantSelectOption";
  PdfErrorCode2[PdfErrorCode2["CantCheckField"] = 28] = "CantCheckField";
  PdfErrorCode2[PdfErrorCode2["CantSetAnnotString"] = 29] = "CantSetAnnotString";
  return PdfErrorCode2;
})(PdfErrorCode || {});
class PdfTaskHelper {
  /**
   * Create a task
   * @returns new task
   */
  static create() {
    return new Task();
  }
  /**
   * Create a task that has been resolved with value
   * @param result - resolved value
   * @returns resolved task
   */
  static resolve(result) {
    const task = new Task();
    task.resolve(result);
    return task;
  }
  /**
   * Create a task that has been rejected with error
   * @param reason - rejected error
   * @returns rejected task
   */
  static reject(reason) {
    const task = new Task();
    task.reject(reason);
    return task;
  }
  /**
   * Create a task that has been aborted with error
   * @param reason - aborted error
   * @returns aborted task
   */
  static abort(reason) {
    const task = new Task();
    task.reject(reason);
    return task;
  }
}
function pdfColorToWebColor(c) {
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const toHex = (n) => clamp(n).toString(16).padStart(2, "0");
  return \`#\${toHex(c.red)}\${toHex(c.green)}\${toHex(c.blue)}\`;
}
function webColorToPdfColor(color) {
  if (/^#?[0-9a-f]{3}$/i.test(color)) {
    color = color.replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3").toLowerCase();
  }
  const [, r, g, b] = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color) ?? (() => {
    throw new Error(\`Invalid hex colour: "\${color}"\`);
  })();
  return {
    red: parseInt(r, 16),
    green: parseInt(g, 16),
    blue: parseInt(b, 16)
  };
}
function pdfAlphaToWebOpacity(alpha) {
  const clamp = (n) => Math.max(0, Math.min(255, n));
  return clamp(alpha) / 255;
}
function webOpacityToPdfAlpha(opacity) {
  const clamp = (n, hi = 255) => Math.max(0, Math.min(hi, n));
  return clamp(Math.round(opacity * 255));
}
function pdfDateToDate(pdf) {
  if (!(pdf == null ? void 0 : pdf.startsWith("D:")) || pdf.length < 16) return;
  const y = +pdf.slice(2, 6);
  const mo = +pdf.slice(6, 8) - 1;
  const d = +pdf.slice(8, 10);
  const H = +pdf.slice(10, 12);
  const M = +pdf.slice(12, 14);
  const S = +pdf.slice(14, 16);
  return new Date(Date.UTC(y, mo, d, H, M, S));
}
function dateToPdfDate(date = /* @__PURE__ */ new Date()) {
  const z = (n, len = 2) => n.toString().padStart(len, "0");
  const YYYY = date.getUTCFullYear();
  const MM = z(date.getUTCMonth() + 1);
  const DD = z(date.getUTCDate());
  const HH = z(date.getUTCHours());
  const mm = z(date.getUTCMinutes());
  const SS = z(date.getUTCSeconds());
  return \`D:\${YYYY}\${MM}\${DD}\${HH}\${mm}\${SS}\`;
}
const TEXT_ALIGNMENT_INFOS = Object.freeze([
  { id: PdfTextAlignment.Left, label: "Left", css: "left" },
  { id: PdfTextAlignment.Center, label: "Center", css: "center" },
  { id: PdfTextAlignment.Right, label: "Right", css: "right" }
]);
TEXT_ALIGNMENT_INFOS.reduce(
  (m, info) => {
    m[info.id] = info;
    return m;
  },
  {}
);
TEXT_ALIGNMENT_INFOS.reduce(
  (m, info) => {
    m[info.css] = info.id;
    return m;
  },
  {}
);
TEXT_ALIGNMENT_INFOS.map((info) => ({
  value: info.id,
  label: info.label
}));
var PdfStandardFontFamily = /* @__PURE__ */ ((PdfStandardFontFamily2) => {
  PdfStandardFontFamily2["Courier"] = "Courier";
  PdfStandardFontFamily2["Helvetica"] = "Helvetica";
  PdfStandardFontFamily2["Times"] = "Times";
  PdfStandardFontFamily2["Symbol"] = "Symbol";
  PdfStandardFontFamily2["ZapfDingbats"] = "ZapfDingbats";
  PdfStandardFontFamily2["Unknown"] = "Unknown";
  return PdfStandardFontFamily2;
})(PdfStandardFontFamily || {});
PdfStandardFont.Helvetica;
const HELVETICA_DESC = {
  id: PdfStandardFont.Helvetica,
  family: "Helvetica",
  bold: false,
  italic: false,
  label: "Helvetica",
  css: "Helvetica, Arial, sans-serif"
};
const STANDARD_FONT_DESCRIPTORS = Object.freeze([
  {
    id: PdfStandardFont.Courier,
    family: "Courier",
    bold: false,
    italic: false,
    label: "Courier",
    css: "Courier, monospace"
  },
  {
    id: PdfStandardFont.Courier_Bold,
    family: "Courier",
    bold: true,
    italic: false,
    label: "Courier Bold",
    css: '"Courier-Bold", Courier, monospace'
  },
  {
    id: PdfStandardFont.Courier_BoldOblique,
    family: "Courier",
    bold: true,
    italic: true,
    label: "Courier Bold Oblique",
    css: '"Courier-BoldOblique", Courier, monospace'
  },
  {
    id: PdfStandardFont.Courier_Oblique,
    family: "Courier",
    bold: false,
    italic: true,
    label: "Courier Oblique",
    css: '"Courier-Oblique", Courier, monospace'
  },
  HELVETICA_DESC,
  {
    id: PdfStandardFont.Helvetica_Bold,
    family: "Helvetica",
    bold: true,
    italic: false,
    label: "Helvetica Bold",
    css: '"Helvetica-Bold", Arial, sans-serif'
  },
  {
    id: PdfStandardFont.Helvetica_BoldOblique,
    family: "Helvetica",
    bold: true,
    italic: true,
    label: "Helvetica Bold Oblique",
    css: '"Helvetica-BoldOblique", Arial, sans-serif'
  },
  {
    id: PdfStandardFont.Helvetica_Oblique,
    family: "Helvetica",
    bold: false,
    italic: true,
    label: "Helvetica Oblique",
    css: '"Helvetica-Oblique", Arial, sans-serif'
  },
  {
    id: PdfStandardFont.Times_Roman,
    family: "Times",
    bold: false,
    italic: false,
    label: "Times Roman",
    css: '"Times New Roman", Times, serif'
  },
  {
    id: PdfStandardFont.Times_Bold,
    family: "Times",
    bold: true,
    italic: false,
    label: "Times Bold",
    css: '"Times New Roman Bold", Times, serif'
  },
  {
    id: PdfStandardFont.Times_BoldItalic,
    family: "Times",
    bold: true,
    italic: true,
    label: "Times Bold Italic",
    css: '"Times New Roman Bold Italic", Times, serif'
  },
  {
    id: PdfStandardFont.Times_Italic,
    family: "Times",
    bold: false,
    italic: true,
    label: "Times Italic",
    css: '"Times New Roman Italic", Times, serif'
  },
  {
    id: PdfStandardFont.Symbol,
    family: "Symbol",
    bold: false,
    italic: false,
    label: "Symbol",
    css: "Symbol"
  },
  {
    id: PdfStandardFont.ZapfDingbats,
    family: "ZapfDingbats",
    bold: false,
    italic: false,
    label: "Zapf Dingbats",
    css: "ZapfDingbats"
  }
]);
STANDARD_FONT_DESCRIPTORS.reduce((m, d) => (m[d.id] = d, m), {});
const familyStyleToId = /* @__PURE__ */ new Map();
for (const d of STANDARD_FONT_DESCRIPTORS) {
  familyStyleToId.set(\`\${d.family}_\${d.bold}_\${d.italic}\`, d.id);
}
Object.values(PdfStandardFontFamily).filter(
  (f) => f !== "Unknown"
  /* Unknown */
).map((family) => ({ value: family, label: family }));
[
  ...new Set(STANDARD_FONT_DESCRIPTORS.map((d) => d.family))
];
const BLEND_MODE_INFOS = Object.freeze([
  { id: PdfBlendMode.Normal, label: "Normal", css: "normal" },
  { id: PdfBlendMode.Multiply, label: "Multiply", css: "multiply" },
  { id: PdfBlendMode.Screen, label: "Screen", css: "screen" },
  { id: PdfBlendMode.Overlay, label: "Overlay", css: "overlay" },
  { id: PdfBlendMode.Darken, label: "Darken", css: "darken" },
  { id: PdfBlendMode.Lighten, label: "Lighten", css: "lighten" },
  { id: PdfBlendMode.ColorDodge, label: "Color Dodge", css: "color-dodge" },
  { id: PdfBlendMode.ColorBurn, label: "Color Burn", css: "color-burn" },
  { id: PdfBlendMode.HardLight, label: "Hard Light", css: "hard-light" },
  { id: PdfBlendMode.SoftLight, label: "Soft Light", css: "soft-light" },
  { id: PdfBlendMode.Difference, label: "Difference", css: "difference" },
  { id: PdfBlendMode.Exclusion, label: "Exclusion", css: "exclusion" },
  { id: PdfBlendMode.Hue, label: "Hue", css: "hue" },
  { id: PdfBlendMode.Saturation, label: "Saturation", css: "saturation" },
  { id: PdfBlendMode.Color, label: "Color", css: "color" },
  { id: PdfBlendMode.Luminosity, label: "Luminosity", css: "luminosity" }
]);
BLEND_MODE_INFOS.reduce(
  (m, info) => {
    m[info.id] = info;
    return m;
  },
  {}
);
BLEND_MODE_INFOS.reduce(
  (m, info) => {
    m[info.css] = info.id;
    return m;
  },
  {}
);
BLEND_MODE_INFOS.map((info) => ({
  value: info.id,
  label: info.label
}));
function deserializeLogger(serialized) {
  var _a, _b, _c;
  switch (serialized.type) {
    case "noop":
      return new NoopLogger();
    case "console":
      return new ConsoleLogger();
    case "perf":
      return new PerfLogger();
    case "level":
      if (!((_a = serialized.config) == null ? void 0 : _a.logger) || ((_b = serialized.config) == null ? void 0 : _b.level) === void 0) {
        throw new Error("LevelLogger requires logger and level in config");
      }
      return new LevelLogger(deserializeLogger(serialized.config.logger), serialized.config.level);
    case "all":
      if (!((_c = serialized.config) == null ? void 0 : _c.loggers)) {
        throw new Error("AllLogger requires loggers array in config");
      }
      return new AllLogger(serialized.config.loggers.map(deserializeLogger));
    default:
      return new NoopLogger();
  }
}
const V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuidV4(str) {
  return V4_REGEX.test(str);
}
function getRandomBytes(len) {
  var _a;
  if (typeof ((_a = globalThis.crypto) == null ? void 0 : _a.getRandomValues) === "function") {
    return globalThis.crypto.getRandomValues(new Uint8Array(len));
  }
  if (typeof require === "function") {
    try {
      const { randomBytes } = require("crypto");
      return randomBytes(len);
    } catch {
    }
  }
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}
function uuidV4() {
  var _a;
  if (typeof ((_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return \`\${hex.slice(0, 8)}-\${hex.slice(8, 12)}-\${hex.slice(12, 16)}-\${hex.slice(16, 20)}-\${hex.slice(20)}\`;
}
function ignore() {
}
var createPdfium = (() => {
  var _scriptName = import.meta.url;
  return async function(moduleArg = {}) {
    var moduleRtn;
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    var readyPromise = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    [
      "_EPDF_GetMetaKeyCount",
      "_EPDF_GetMetaKeyName",
      "_EPDF_GetMetaTrapped",
      "_EPDF_GetPageRotationByIndex",
      "_EPDF_HasMetaText",
      "_EPDF_PNG_EncodeRGBA",
      "_EPDF_RenderAnnotBitmap",
      "_EPDF_SetMetaText",
      "_EPDF_SetMetaTrapped",
      "_EPDFAction_CreateGoTo",
      "_EPDFAction_CreateGoToNamed",
      "_EPDFAction_CreateLaunch",
      "_EPDFAction_CreateRemoteGoToByName",
      "_EPDFAction_CreateRemoteGoToDest",
      "_EPDFAction_CreateURI",
      "_EPDFAnnot_ClearColor",
      "_EPDFAnnot_GenerateAppearance",
      "_EPDFAnnot_GenerateAppearanceWithBlend",
      "_EPDFAnnot_GetBlendMode",
      "_EPDFAnnot_GetBorderDashPattern",
      "_EPDFAnnot_GetBorderDashPatternCount",
      "_EPDFAnnot_GetBorderEffect",
      "_EPDFAnnot_GetBorderStyle",
      "_EPDFAnnot_GetColor",
      "_EPDFAnnot_GetDefaultAppearance",
      "_EPDFAnnot_GetIcon",
      "_EPDFAnnot_GetIntent",
      "_EPDFAnnot_GetLineEndings",
      "_EPDFAnnot_GetOpacity",
      "_EPDFAnnot_GetRectangleDifferences",
      "_EPDFAnnot_GetRichContent",
      "_EPDFAnnot_GetTextAlignment",
      "_EPDFAnnot_GetVerticalAlignment",
      "_EPDFAnnot_SetBorderDashPattern",
      "_EPDFAnnot_SetBorderStyle",
      "_EPDFAnnot_SetColor",
      "_EPDFAnnot_SetDefaultAppearance",
      "_EPDFAnnot_SetIcon",
      "_EPDFAnnot_SetIntent",
      "_EPDFAnnot_SetLine",
      "_EPDFAnnot_SetLineEndings",
      "_EPDFAnnot_SetLinkedAnnot",
      "_EPDFAnnot_SetOpacity",
      "_EPDFAnnot_SetTextAlignment",
      "_EPDFAnnot_SetVerticalAlignment",
      "_EPDFAnnot_SetVertices",
      "_EPDFAnnot_UpdateAppearanceToRect",
      "_EPDFAttachment_GetDescription",
      "_EPDFAttachment_GetIntegerValue",
      "_EPDFAttachment_SetDescription",
      "_EPDFAttachment_SetSubtype",
      "_EPDFBookmark_AppendChild",
      "_EPDFBookmark_Clear",
      "_EPDFBookmark_ClearTarget",
      "_EPDFBookmark_Create",
      "_EPDFBookmark_Delete",
      "_EPDFBookmark_InsertAfter",
      "_EPDFBookmark_SetAction",
      "_EPDFBookmark_SetDest",
      "_EPDFBookmark_SetTitle",
      "_EPDFCatalog_GetLanguage",
      "_EPDFDest_CreateRemoteView",
      "_EPDFDest_CreateRemoteXYZ",
      "_EPDFDest_CreateView",
      "_EPDFDest_CreateXYZ",
      "_EPDFNamedDest_Remove",
      "_EPDFNamedDest_SetDest",
      "_EPDFPage_CreateAnnot",
      "_EPDFPage_GetAnnotByName",
      "_EPDFPage_GetAnnotCountRaw",
      "_EPDFPage_GetAnnotRaw",
      "_EPDFPage_RemoveAnnotByName",
      "_EPDFPage_RemoveAnnotRaw",
      "_EPDFText_RedactInQuads",
      "_EPDFText_RedactInRect",
      "_FORM_CanRedo",
      "_FORM_CanUndo",
      "_FORM_DoDocumentAAction",
      "_FORM_DoDocumentJSAction",
      "_FORM_DoDocumentOpenAction",
      "_FORM_DoPageAAction",
      "_FORM_ForceToKillFocus",
      "_FORM_GetFocusedAnnot",
      "_FORM_GetFocusedText",
      "_FORM_GetSelectedText",
      "_FORM_IsIndexSelected",
      "_FORM_OnAfterLoadPage",
      "_FORM_OnBeforeClosePage",
      "_FORM_OnChar",
      "_FORM_OnFocus",
      "_FORM_OnKeyDown",
      "_FORM_OnKeyUp",
      "_FORM_OnLButtonDoubleClick",
      "_FORM_OnLButtonDown",
      "_FORM_OnLButtonUp",
      "_FORM_OnMouseMove",
      "_FORM_OnMouseWheel",
      "_FORM_OnRButtonDown",
      "_FORM_OnRButtonUp",
      "_FORM_Redo",
      "_FORM_ReplaceAndKeepSelection",
      "_FORM_ReplaceSelection",
      "_FORM_SelectAllText",
      "_FORM_SetFocusedAnnot",
      "_FORM_SetIndexSelected",
      "_FORM_Undo",
      "_FPDF_AddInstalledFont",
      "_FPDF_CloseDocument",
      "_FPDF_ClosePage",
      "_FPDF_CloseXObject",
      "_FPDF_CopyViewerPreferences",
      "_FPDF_CountNamedDests",
      "_FPDF_CreateClipPath",
      "_FPDF_CreateNewDocument",
      "_FPDF_DestroyClipPath",
      "_FPDF_DestroyLibrary",
      "_FPDF_DeviceToPage",
      "_FPDF_DocumentHasValidCrossReferenceTable",
      "_FPDF_FFLDraw",
      "_FPDF_FreeDefaultSystemFontInfo",
      "_FPDF_GetDefaultSystemFontInfo",
      "_FPDF_GetDefaultTTFMap",
      "_FPDF_GetDefaultTTFMapCount",
      "_FPDF_GetDefaultTTFMapEntry",
      "_FPDF_GetDocPermissions",
      "_FPDF_GetDocUserPermissions",
      "_FPDF_GetFileIdentifier",
      "_FPDF_GetFileVersion",
      "_FPDF_GetFormType",
      "_FPDF_GetLastError",
      "_FPDF_GetMetaText",
      "_FPDF_GetNamedDest",
      "_FPDF_GetNamedDestByName",
      "_FPDF_GetPageAAction",
      "_FPDF_GetPageBoundingBox",
      "_FPDF_GetPageCount",
      "_FPDF_GetPageHeight",
      "_FPDF_GetPageHeightF",
      "_FPDF_GetPageLabel",
      "_FPDF_GetPageSizeByIndex",
      "_FPDF_GetPageSizeByIndexF",
      "_FPDF_GetPageWidth",
      "_FPDF_GetPageWidthF",
      "_FPDF_GetSecurityHandlerRevision",
      "_FPDF_GetSignatureCount",
      "_FPDF_GetSignatureObject",
      "_FPDF_GetTrailerEnds",
      "_FPDF_GetXFAPacketContent",
      "_FPDF_GetXFAPacketCount",
      "_FPDF_GetXFAPacketName",
      "_FPDF_ImportNPagesToOne",
      "_FPDF_ImportPages",
      "_FPDF_ImportPagesByIndex",
      "_FPDF_InitLibrary",
      "_FPDF_InitLibraryWithConfig",
      "_FPDF_LoadCustomDocument",
      "_FPDF_LoadDocument",
      "_FPDF_LoadMemDocument",
      "_FPDF_LoadMemDocument64",
      "_FPDF_LoadPage",
      "_FPDF_LoadXFA",
      "_FPDF_MovePages",
      "_FPDF_NewFormObjectFromXObject",
      "_FPDF_NewXObjectFromPage",
      "_FPDF_PageToDevice",
      "_FPDF_RemoveFormFieldHighlight",
      "_FPDF_RenderPage_Close",
      "_FPDF_RenderPage_Continue",
      "_FPDF_RenderPageBitmap",
      "_FPDF_RenderPageBitmap_Start",
      "_FPDF_RenderPageBitmapWithColorScheme_Start",
      "_FPDF_RenderPageBitmapWithMatrix",
      "_FPDF_SaveAsCopy",
      "_FPDF_SaveWithVersion",
      "_FPDF_SetFormFieldHighlightAlpha",
      "_FPDF_SetFormFieldHighlightColor",
      "_FPDF_SetSandBoxPolicy",
      "_FPDF_SetSystemFontInfo",
      "_FPDF_StructElement_Attr_CountChildren",
      "_FPDF_StructElement_Attr_GetBlobValue",
      "_FPDF_StructElement_Attr_GetBooleanValue",
      "_FPDF_StructElement_Attr_GetChildAtIndex",
      "_FPDF_StructElement_Attr_GetCount",
      "_FPDF_StructElement_Attr_GetName",
      "_FPDF_StructElement_Attr_GetNumberValue",
      "_FPDF_StructElement_Attr_GetStringValue",
      "_FPDF_StructElement_Attr_GetType",
      "_FPDF_StructElement_Attr_GetValue",
      "_FPDF_StructElement_CountChildren",
      "_FPDF_StructElement_GetActualText",
      "_FPDF_StructElement_GetAltText",
      "_FPDF_StructElement_GetAttributeAtIndex",
      "_FPDF_StructElement_GetAttributeCount",
      "_FPDF_StructElement_GetChildAtIndex",
      "_FPDF_StructElement_GetChildMarkedContentID",
      "_FPDF_StructElement_GetID",
      "_FPDF_StructElement_GetLang",
      "_FPDF_StructElement_GetMarkedContentID",
      "_FPDF_StructElement_GetMarkedContentIdAtIndex",
      "_FPDF_StructElement_GetMarkedContentIdCount",
      "_FPDF_StructElement_GetObjType",
      "_FPDF_StructElement_GetParent",
      "_FPDF_StructElement_GetStringAttribute",
      "_FPDF_StructElement_GetTitle",
      "_FPDF_StructElement_GetType",
      "_FPDF_StructTree_Close",
      "_FPDF_StructTree_CountChildren",
      "_FPDF_StructTree_GetChildAtIndex",
      "_FPDF_StructTree_GetForPage",
      "_FPDF_VIEWERREF_GetDuplex",
      "_FPDF_VIEWERREF_GetName",
      "_FPDF_VIEWERREF_GetNumCopies",
      "_FPDF_VIEWERREF_GetPrintPageRange",
      "_FPDF_VIEWERREF_GetPrintPageRangeCount",
      "_FPDF_VIEWERREF_GetPrintPageRangeElement",
      "_FPDF_VIEWERREF_GetPrintScaling",
      "_FPDFAction_GetDest",
      "_FPDFAction_GetFilePath",
      "_FPDFAction_GetType",
      "_FPDFAction_GetURIPath",
      "_FPDFAnnot_AddFileAttachment",
      "_FPDFAnnot_AddInkStroke",
      "_FPDFAnnot_AppendAttachmentPoints",
      "_FPDFAnnot_AppendObject",
      "_FPDFAnnot_CountAttachmentPoints",
      "_FPDFAnnot_GetAP",
      "_FPDFAnnot_GetAttachmentPoints",
      "_FPDFAnnot_GetBorder",
      "_FPDFAnnot_GetColor",
      "_FPDFAnnot_GetFileAttachment",
      "_FPDFAnnot_GetFlags",
      "_FPDFAnnot_GetFocusableSubtypes",
      "_FPDFAnnot_GetFocusableSubtypesCount",
      "_FPDFAnnot_GetFontColor",
      "_FPDFAnnot_GetFontSize",
      "_FPDFAnnot_GetFormAdditionalActionJavaScript",
      "_FPDFAnnot_GetFormControlCount",
      "_FPDFAnnot_GetFormControlIndex",
      "_FPDFAnnot_GetFormFieldAlternateName",
      "_FPDFAnnot_GetFormFieldAtPoint",
      "_FPDFAnnot_GetFormFieldExportValue",
      "_FPDFAnnot_GetFormFieldFlags",
      "_FPDFAnnot_GetFormFieldName",
      "_FPDFAnnot_GetFormFieldType",
      "_FPDFAnnot_GetFormFieldValue",
      "_FPDFAnnot_GetInkListCount",
      "_FPDFAnnot_GetInkListPath",
      "_FPDFAnnot_GetLine",
      "_FPDFAnnot_GetLink",
      "_FPDFAnnot_GetLinkedAnnot",
      "_FPDFAnnot_GetNumberValue",
      "_FPDFAnnot_GetObject",
      "_FPDFAnnot_GetObjectCount",
      "_FPDFAnnot_GetOptionCount",
      "_FPDFAnnot_GetOptionLabel",
      "_FPDFAnnot_GetRect",
      "_FPDFAnnot_GetStringValue",
      "_FPDFAnnot_GetSubtype",
      "_FPDFAnnot_GetValueType",
      "_FPDFAnnot_GetVertices",
      "_FPDFAnnot_HasAttachmentPoints",
      "_FPDFAnnot_HasKey",
      "_FPDFAnnot_IsChecked",
      "_FPDFAnnot_IsObjectSupportedSubtype",
      "_FPDFAnnot_IsOptionSelected",
      "_FPDFAnnot_IsSupportedSubtype",
      "_FPDFAnnot_RemoveInkList",
      "_FPDFAnnot_RemoveObject",
      "_FPDFAnnot_SetAP",
      "_FPDFAnnot_SetAttachmentPoints",
      "_FPDFAnnot_SetBorder",
      "_FPDFAnnot_SetColor",
      "_FPDFAnnot_SetFlags",
      "_FPDFAnnot_SetFocusableSubtypes",
      "_FPDFAnnot_SetFontColor",
      "_FPDFAnnot_SetFormFieldFlags",
      "_FPDFAnnot_SetRect",
      "_FPDFAnnot_SetStringValue",
      "_FPDFAnnot_SetURI",
      "_FPDFAnnot_UpdateObject",
      "_FPDFAttachment_GetFile",
      "_FPDFAttachment_GetName",
      "_FPDFAttachment_GetStringValue",
      "_FPDFAttachment_GetSubtype",
      "_FPDFAttachment_GetValueType",
      "_FPDFAttachment_HasKey",
      "_FPDFAttachment_SetFile",
      "_FPDFAttachment_SetStringValue",
      "_FPDFAvail_Create",
      "_FPDFAvail_Destroy",
      "_FPDFAvail_GetDocument",
      "_FPDFAvail_GetFirstPageNum",
      "_FPDFAvail_IsDocAvail",
      "_FPDFAvail_IsFormAvail",
      "_FPDFAvail_IsLinearized",
      "_FPDFAvail_IsPageAvail",
      "_FPDFBitmap_Create",
      "_FPDFBitmap_CreateEx",
      "_FPDFBitmap_Destroy",
      "_FPDFBitmap_FillRect",
      "_FPDFBitmap_GetBuffer",
      "_FPDFBitmap_GetFormat",
      "_FPDFBitmap_GetHeight",
      "_FPDFBitmap_GetStride",
      "_FPDFBitmap_GetWidth",
      "_FPDFBookmark_Find",
      "_FPDFBookmark_GetAction",
      "_FPDFBookmark_GetCount",
      "_FPDFBookmark_GetDest",
      "_FPDFBookmark_GetFirstChild",
      "_FPDFBookmark_GetNextSibling",
      "_FPDFBookmark_GetTitle",
      "_FPDFCatalog_IsTagged",
      "_FPDFCatalog_SetLanguage",
      "_FPDFClipPath_CountPaths",
      "_FPDFClipPath_CountPathSegments",
      "_FPDFClipPath_GetPathSegment",
      "_FPDFDest_GetDestPageIndex",
      "_FPDFDest_GetLocationInPage",
      "_FPDFDest_GetView",
      "_FPDFDoc_AddAttachment",
      "_FPDFDoc_CloseJavaScriptAction",
      "_FPDFDoc_DeleteAttachment",
      "_FPDFDOC_ExitFormFillEnvironment",
      "_FPDFDoc_GetAttachment",
      "_FPDFDoc_GetAttachmentCount",
      "_FPDFDoc_GetJavaScriptAction",
      "_FPDFDoc_GetJavaScriptActionCount",
      "_FPDFDoc_GetPageMode",
      "_FPDFDOC_InitFormFillEnvironment",
      "_FPDFFont_Close",
      "_FPDFFont_GetAscent",
      "_FPDFFont_GetBaseFontName",
      "_FPDFFont_GetDescent",
      "_FPDFFont_GetFamilyName",
      "_FPDFFont_GetFlags",
      "_FPDFFont_GetFontData",
      "_FPDFFont_GetGlyphPath",
      "_FPDFFont_GetGlyphWidth",
      "_FPDFFont_GetIsEmbedded",
      "_FPDFFont_GetItalicAngle",
      "_FPDFFont_GetWeight",
      "_FPDFFormObj_CountObjects",
      "_FPDFFormObj_GetObject",
      "_FPDFFormObj_RemoveObject",
      "_FPDFGlyphPath_CountGlyphSegments",
      "_FPDFGlyphPath_GetGlyphPathSegment",
      "_FPDFImageObj_GetBitmap",
      "_FPDFImageObj_GetIccProfileDataDecoded",
      "_FPDFImageObj_GetImageDataDecoded",
      "_FPDFImageObj_GetImageDataRaw",
      "_FPDFImageObj_GetImageFilter",
      "_FPDFImageObj_GetImageFilterCount",
      "_FPDFImageObj_GetImageMetadata",
      "_FPDFImageObj_GetImagePixelSize",
      "_FPDFImageObj_GetRenderedBitmap",
      "_FPDFImageObj_LoadJpegFile",
      "_FPDFImageObj_LoadJpegFileInline",
      "_FPDFImageObj_SetBitmap",
      "_FPDFImageObj_SetMatrix",
      "_FPDFJavaScriptAction_GetName",
      "_FPDFJavaScriptAction_GetScript",
      "_FPDFLink_CloseWebLinks",
      "_FPDFLink_CountQuadPoints",
      "_FPDFLink_CountRects",
      "_FPDFLink_CountWebLinks",
      "_FPDFLink_Enumerate",
      "_FPDFLink_GetAction",
      "_FPDFLink_GetAnnot",
      "_FPDFLink_GetAnnotRect",
      "_FPDFLink_GetDest",
      "_FPDFLink_GetLinkAtPoint",
      "_FPDFLink_GetLinkZOrderAtPoint",
      "_FPDFLink_GetQuadPoints",
      "_FPDFLink_GetRect",
      "_FPDFLink_GetTextRange",
      "_FPDFLink_GetURL",
      "_FPDFLink_LoadWebLinks",
      "_FPDFPage_CloseAnnot",
      "_FPDFPage_CountObjects",
      "_FPDFPage_CreateAnnot",
      "_FPDFPage_Delete",
      "_FPDFPage_Flatten",
      "_FPDFPage_FormFieldZOrderAtPoint",
      "_FPDFPage_GenerateContent",
      "_FPDFPage_GetAnnot",
      "_FPDFPage_GetAnnotCount",
      "_FPDFPage_GetAnnotIndex",
      "_FPDFPage_GetArtBox",
      "_FPDFPage_GetBleedBox",
      "_FPDFPage_GetCropBox",
      "_FPDFPage_GetDecodedThumbnailData",
      "_FPDFPage_GetMediaBox",
      "_FPDFPage_GetObject",
      "_FPDFPage_GetRawThumbnailData",
      "_FPDFPage_GetRotation",
      "_FPDFPage_GetThumbnailAsBitmap",
      "_FPDFPage_GetTrimBox",
      "_FPDFPage_HasFormFieldAtPoint",
      "_FPDFPage_HasTransparency",
      "_FPDFPage_InsertClipPath",
      "_FPDFPage_InsertObject",
      "_FPDFPage_InsertObjectAtIndex",
      "_FPDFPage_New",
      "_FPDFPage_RemoveAnnot",
      "_FPDFPage_RemoveObject",
      "_FPDFPage_SetArtBox",
      "_FPDFPage_SetBleedBox",
      "_FPDFPage_SetCropBox",
      "_FPDFPage_SetMediaBox",
      "_FPDFPage_SetRotation",
      "_FPDFPage_SetTrimBox",
      "_FPDFPage_TransformAnnots",
      "_FPDFPage_TransFormWithClip",
      "_FPDFPageObj_AddMark",
      "_FPDFPageObj_CountMarks",
      "_FPDFPageObj_CreateNewPath",
      "_FPDFPageObj_CreateNewRect",
      "_FPDFPageObj_CreateTextObj",
      "_FPDFPageObj_Destroy",
      "_FPDFPageObj_GetBounds",
      "_FPDFPageObj_GetClipPath",
      "_FPDFPageObj_GetDashArray",
      "_FPDFPageObj_GetDashCount",
      "_FPDFPageObj_GetDashPhase",
      "_FPDFPageObj_GetFillColor",
      "_FPDFPageObj_GetIsActive",
      "_FPDFPageObj_GetLineCap",
      "_FPDFPageObj_GetLineJoin",
      "_FPDFPageObj_GetMark",
      "_FPDFPageObj_GetMarkedContentID",
      "_FPDFPageObj_GetMatrix",
      "_FPDFPageObj_GetRotatedBounds",
      "_FPDFPageObj_GetStrokeColor",
      "_FPDFPageObj_GetStrokeWidth",
      "_FPDFPageObj_GetType",
      "_FPDFPageObj_HasTransparency",
      "_FPDFPageObj_NewImageObj",
      "_FPDFPageObj_NewTextObj",
      "_FPDFPageObj_RemoveMark",
      "_FPDFPageObj_SetBlendMode",
      "_FPDFPageObj_SetDashArray",
      "_FPDFPageObj_SetDashPhase",
      "_FPDFPageObj_SetFillColor",
      "_FPDFPageObj_SetIsActive",
      "_FPDFPageObj_SetLineCap",
      "_FPDFPageObj_SetLineJoin",
      "_FPDFPageObj_SetMatrix",
      "_FPDFPageObj_SetStrokeColor",
      "_FPDFPageObj_SetStrokeWidth",
      "_FPDFPageObj_Transform",
      "_FPDFPageObj_TransformClipPath",
      "_FPDFPageObj_TransformF",
      "_FPDFPageObjMark_CountParams",
      "_FPDFPageObjMark_GetName",
      "_FPDFPageObjMark_GetParamBlobValue",
      "_FPDFPageObjMark_GetParamIntValue",
      "_FPDFPageObjMark_GetParamKey",
      "_FPDFPageObjMark_GetParamStringValue",
      "_FPDFPageObjMark_GetParamValueType",
      "_FPDFPageObjMark_RemoveParam",
      "_FPDFPageObjMark_SetBlobParam",
      "_FPDFPageObjMark_SetIntParam",
      "_FPDFPageObjMark_SetStringParam",
      "_FPDFPath_BezierTo",
      "_FPDFPath_Close",
      "_FPDFPath_CountSegments",
      "_FPDFPath_GetDrawMode",
      "_FPDFPath_GetPathSegment",
      "_FPDFPath_LineTo",
      "_FPDFPath_MoveTo",
      "_FPDFPath_SetDrawMode",
      "_FPDFPathSegment_GetClose",
      "_FPDFPathSegment_GetPoint",
      "_FPDFPathSegment_GetType",
      "_FPDFSignatureObj_GetByteRange",
      "_FPDFSignatureObj_GetContents",
      "_FPDFSignatureObj_GetDocMDPPermission",
      "_FPDFSignatureObj_GetReason",
      "_FPDFSignatureObj_GetSubFilter",
      "_FPDFSignatureObj_GetTime",
      "_FPDFText_ClosePage",
      "_FPDFText_CountChars",
      "_FPDFText_CountRects",
      "_FPDFText_FindClose",
      "_FPDFText_FindNext",
      "_FPDFText_FindPrev",
      "_FPDFText_FindStart",
      "_FPDFText_GetBoundedText",
      "_FPDFText_GetCharAngle",
      "_FPDFText_GetCharBox",
      "_FPDFText_GetCharIndexAtPos",
      "_FPDFText_GetCharIndexFromTextIndex",
      "_FPDFText_GetCharOrigin",
      "_FPDFText_GetFillColor",
      "_FPDFText_GetFontInfo",
      "_FPDFText_GetFontSize",
      "_FPDFText_GetFontWeight",
      "_FPDFText_GetLooseCharBox",
      "_FPDFText_GetMatrix",
      "_FPDFText_GetRect",
      "_FPDFText_GetSchCount",
      "_FPDFText_GetSchResultIndex",
      "_FPDFText_GetStrokeColor",
      "_FPDFText_GetText",
      "_FPDFText_GetTextIndexFromCharIndex",
      "_FPDFText_GetTextObject",
      "_FPDFText_GetUnicode",
      "_FPDFText_HasUnicodeMapError",
      "_FPDFText_IsGenerated",
      "_FPDFText_IsHyphen",
      "_FPDFText_LoadCidType2Font",
      "_FPDFText_LoadFont",
      "_FPDFText_LoadPage",
      "_FPDFText_LoadStandardFont",
      "_FPDFText_SetCharcodes",
      "_FPDFText_SetText",
      "_FPDFTextObj_GetFont",
      "_FPDFTextObj_GetFontSize",
      "_FPDFTextObj_GetRenderedBitmap",
      "_FPDFTextObj_GetText",
      "_FPDFTextObj_GetTextRenderMode",
      "_FPDFTextObj_SetTextRenderMode",
      "_PDFiumExt_CloseFileWriter",
      "_PDFiumExt_CloseFormFillInfo",
      "_PDFiumExt_ExitFormFillEnvironment",
      "_PDFiumExt_GetFileWriterData",
      "_PDFiumExt_GetFileWriterSize",
      "_PDFiumExt_Init",
      "_PDFiumExt_InitFormFillEnvironment",
      "_PDFiumExt_OpenFileWriter",
      "_PDFiumExt_OpenFormFillInfo",
      "_PDFiumExt_SaveAsCopy",
      "_malloc",
      "_free",
      "_memory",
      "___indirect_function_table",
      "onRuntimeInitialized"
    ].forEach((prop) => {
      if (!Object.getOwnPropertyDescriptor(readyPromise, prop)) {
        Object.defineProperty(readyPromise, prop, {
          get: () => abort(
            "You are getting " + prop + " on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js"
          ),
          set: () => abort(
            "You are setting " + prop + " on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js"
          )
        });
      }
    });
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string" && process.type != "renderer";
    var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && true && !ENVIRONMENT_IS_WORKER;
    var moduleOverrides = Object.assign({}, Module);
    var thisProgram = "./this.program";
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var readAsync, readBinary;
    if (ENVIRONMENT_IS_SHELL) {
      if (typeof window == "object" || typeof importScripts == "function")
        throw new Error(
          "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)"
        );
      readBinary = (f) => {
        if (typeof readbuffer == "function") {
          return new Uint8Array(readbuffer(f));
        }
        let data = read(f, "binary");
        assert(typeof data == "object");
        return data;
      };
      readAsync = (f) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => resolve(readBinary(f)));
        });
      };
      globalThis.clearTimeout ?? (globalThis.clearTimeout = (id) => {
      });
      globalThis.setTimeout ?? (globalThis.setTimeout = (f) => typeof f == "function" ? f() : abort());
      if (typeof print != "undefined") {
        globalThis.console ?? (globalThis.console = /** @type{!Console} */
        {});
        console.log = /** @type{!function(this:Console, ...*): undefined} */
        print;
        console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */
        globalThis.printErr ?? print;
      }
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptName) {
        scriptDirectory = _scriptName;
      }
      if (scriptDirectory.startsWith("blob:")) {
        scriptDirectory = "";
      } else {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1
        );
      }
      if (!(typeof window == "object" || typeof importScripts == "function"))
        throw new Error(
          "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)"
        );
      {
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(
              /** @type{!ArrayBuffer} */
              xhr.response
            );
          };
        }
        readAsync = (url) => {
          assert(!isFileURI(url), "readAsync does not work with file:// URLs");
          return fetch(url, { credentials: "same-origin" }).then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            }
            return Promise.reject(new Error(response.status + " : " + response.url));
          });
        };
      }
    } else {
      throw new Error("environment detection error");
    }
    var out = Module["print"] || console.log.bind(console);
    var err = Module["printErr"] || console.error.bind(console);
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    checkIncomingModuleAPI();
    if (Module["arguments"]) Module["arguments"];
    legacyModuleProp("arguments", "arguments_");
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    legacyModuleProp("thisProgram", "thisProgram");
    assert(
      typeof Module["memoryInitializerPrefixURL"] == "undefined",
      "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["pthreadMainPrefixURL"] == "undefined",
      "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["cdInitializerPrefixURL"] == "undefined",
      "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead"
    );
    assert(
      typeof Module["filePackagePrefixURL"] == "undefined",
      "Module.filePackagePrefixURL option was removed, use Module.locateFile instead"
    );
    assert(typeof Module["read"] == "undefined", "Module.read option was removed");
    assert(
      typeof Module["readAsync"] == "undefined",
      "Module.readAsync option was removed (modify readAsync in JS)"
    );
    assert(
      typeof Module["readBinary"] == "undefined",
      "Module.readBinary option was removed (modify readBinary in JS)"
    );
    assert(
      typeof Module["setWindowTitle"] == "undefined",
      "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)"
    );
    assert(
      typeof Module["TOTAL_MEMORY"] == "undefined",
      "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY"
    );
    legacyModuleProp("asm", "wasmExports");
    legacyModuleProp("readAsync", "readAsync");
    legacyModuleProp("readBinary", "readBinary");
    legacyModuleProp("setWindowTitle", "setWindowTitle");
    var wasmBinary = Module["wasmBinary"];
    legacyModuleProp("wasmBinary", "wasmBinary");
    if (typeof WebAssembly != "object") {
      err("no native wasm support detected");
    }
    var wasmMemory;
    var ABORT = false;
    function assert(condition, text) {
      if (!condition) {
        abort("Assertion failed" + (text ? ": " + text : ""));
      }
    }
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module["HEAP8"] = HEAP8 = new Int8Array(b);
      Module["HEAP16"] = HEAP16 = new Int16Array(b);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module["HEAP32"] = HEAP32 = new Int32Array(b);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    }
    assert(
      !Module["STACK_SIZE"],
      "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time"
    );
    assert(
      typeof Int32Array != "undefined" && typeof Float64Array !== "undefined" && Int32Array.prototype.subarray != void 0 && Int32Array.prototype.set != void 0,
      "JS engine does not provide full typed array support"
    );
    assert(
      !Module["wasmMemory"],
      "Use of \`wasmMemory\` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally"
    );
    assert(
      !Module["INITIAL_MEMORY"],
      "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically"
    );
    function writeStackCookie() {
      var max = _emscripten_stack_get_end();
      assert((max & 3) == 0);
      if (max == 0) {
        max += 4;
      }
      HEAPU32[max >> 2] = 34821223;
      HEAPU32[max + 4 >> 2] = 2310721022;
      HEAPU32[0 >> 2] = 1668509029;
    }
    function checkStackCookie() {
      if (ABORT) return;
      var max = _emscripten_stack_get_end();
      if (max == 0) {
        max += 4;
      }
      var cookie1 = HEAPU32[max >> 2];
      var cookie2 = HEAPU32[max + 4 >> 2];
      if (cookie1 != 34821223 || cookie2 != 2310721022) {
        abort(
          \`Stack overflow! Stack cookie has been overwritten at \${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received \${ptrToString(cookie2)} \${ptrToString(cookie1)}\`
        );
      }
      if (HEAPU32[0 >> 2] != 1668509029) {
        abort("Runtime error: The application has corrupted its heap memory area (address zero)!");
      }
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      var preRuns = Module["preRun"];
      if (preRuns) {
        if (typeof preRuns == "function") preRuns = [preRuns];
        preRuns.forEach(addOnPreRun);
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      assert(!runtimeInitialized);
      runtimeInitialized = true;
      checkStackCookie();
      if (!Module["noFSInit"] && !FS.initialized) FS.init();
      FS.ignorePermissions = false;
      callRuntimeCallbacks(__ATINIT__);
    }
    function postRun() {
      checkStackCookie();
      var postRuns = Module["postRun"];
      if (postRuns) {
        if (typeof postRuns == "function") postRuns = [postRuns];
        postRuns.forEach(addOnPostRun);
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    assert(
      Math.imul,
      "This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill"
    );
    assert(
      Math.fround,
      "This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill"
    );
    assert(
      Math.clz32,
      "This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill"
    );
    assert(
      Math.trunc,
      "This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill"
    );
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    var runDependencyTracking = {};
    function getUniqueRunDependency(id) {
      var orig = id;
      while (1) {
        if (!runDependencyTracking[id]) return id;
        id = orig + Math.random();
      }
    }
    function addRunDependency(id) {
      var _a;
      runDependencies++;
      (_a = Module["monitorRunDependencies"]) == null ? void 0 : _a.call(Module, runDependencies);
      if (id) {
        assert(!runDependencyTracking[id]);
        runDependencyTracking[id] = 1;
        if (runDependencyWatcher === null && typeof setInterval != "undefined") {
          runDependencyWatcher = setInterval(() => {
            if (ABORT) {
              clearInterval(runDependencyWatcher);
              runDependencyWatcher = null;
              return;
            }
            var shown = false;
            for (var dep in runDependencyTracking) {
              if (!shown) {
                shown = true;
                err("still waiting on run dependencies:");
              }
              err(\`dependency: \${dep}\`);
            }
            if (shown) {
              err("(end of list)");
            }
          }, 1e4);
        }
      } else {
        err("warning: run dependency added without ID");
      }
    }
    function removeRunDependency(id) {
      var _a;
      runDependencies--;
      (_a = Module["monitorRunDependencies"]) == null ? void 0 : _a.call(Module, runDependencies);
      if (id) {
        assert(runDependencyTracking[id]);
        delete runDependencyTracking[id];
      } else {
        err("warning: run dependency removed without ID");
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      var _a;
      (_a = Module["onAbort"]) == null ? void 0 : _a.call(Module, what);
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
    var isFileURI = (filename) => filename.startsWith("file://");
    function createExportWrapper(name, nargs) {
      return (...args) => {
        assert(
          runtimeInitialized,
          \`native function \\\`\${name}\\\` called before runtime initialization\`
        );
        var f = wasmExports[name];
        assert(f, \`exported native function \\\`\${name}\\\` not found\`);
        assert(
          args.length <= nargs,
          \`native function \\\`\${name}\\\` called with \${args.length} args but expects \${nargs}\`
        );
        return f(...args);
      };
    }
    function findWasmBinary() {
      if (Module["locateFile"]) {
        var f = "pdfium.wasm";
        if (!isDataURI(f)) {
          return locateFile(f);
        }
        return f;
      }
      if (ENVIRONMENT_IS_SHELL) return "pdfium.wasm";
      return "pdfium.wasm";
    }
    var wasmBinaryFile;
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary) {
        return readAsync(binaryFile).then(
          (response) => new Uint8Array(
            /** @type{!ArrayBuffer} */
            response
          ),
          // Fall back to getBinarySync if readAsync fails
          () => getBinarySync(binaryFile)
        );
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile).then((binary) => {
        return WebAssembly.instantiate(binary, imports);
      }).then(receiver, (reason) => {
        err(\`failed to asynchronously prepare wasm: \${reason}\`);
        if (isFileURI(wasmBinaryFile)) {
          err(
            \`warning: Loading from a file URI (\${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing\`
          );
        }
        abort(reason);
      });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isDataURI(binaryFile) && // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      true && typeof fetch == "function") {
        return fetch(binaryFile, { credentials: "same-origin" }).then((response) => {
          var result = WebAssembly.instantiateStreaming(response, imports);
          return result.then(callback, function(reason) {
            err(\`wasm streaming compile failed: \${reason}\`);
            err("falling back to ArrayBuffer instantiation");
            return instantiateArrayBuffer(binaryFile, imports, callback);
          });
        });
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function getWasmImports() {
      return {
        env: wasmImports,
        wasi_snapshot_preview1: wasmImports
      };
    }
    function createWasm() {
      var info = getWasmImports();
      function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        Module["wasmExports"] = wasmExports;
        wasmMemory = wasmExports["memory"];
        assert(wasmMemory, "memory not found in wasm exports");
        updateMemoryViews();
        wasmTable = wasmExports["__indirect_function_table"];
        assert(wasmTable, "table not found in wasm exports");
        addOnInit(wasmExports["__wasm_call_ctors"]);
        removeRunDependency("wasm-instantiate");
        return wasmExports;
      }
      addRunDependency("wasm-instantiate");
      var trueModule = Module;
      function receiveInstantiationResult(result) {
        assert(
          Module === trueModule,
          "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?"
        );
        trueModule = null;
        receiveInstance(result["instance"]);
      }
      if (Module["instantiateWasm"]) {
        try {
          return Module["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err(\`Module.instantiateWasm callback failed with error: \${e}\`);
          readyPromiseReject(e);
        }
      }
      wasmBinaryFile ?? (wasmBinaryFile = findWasmBinary());
      instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(
        readyPromiseReject
      );
      return {};
    }
    var tempDouble;
    var tempI64;
    (() => {
      var h16 = new Int16Array(1);
      var h8 = new Int8Array(h16.buffer);
      h16[0] = 25459;
      if (h8[0] !== 115 || h8[1] !== 99)
        throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
    })();
    if (Module["ENVIRONMENT"]) {
      throw new Error(
        "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)"
      );
    }
    function legacyModuleProp(prop, newName, incoming = true) {
      if (!Object.getOwnPropertyDescriptor(Module, prop)) {
        Object.defineProperty(Module, prop, {
          configurable: true,
          get() {
            let extra = incoming ? " (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)" : "";
            abort(\`\\\`Module.\${prop}\\\` has been replaced by \\\`\${newName}\\\`\` + extra);
          }
        });
      }
    }
    function ignoredModuleProp(prop) {
      if (Object.getOwnPropertyDescriptor(Module, prop)) {
        abort(
          \`\\\`Module.\${prop}\\\` was supplied but \\\`\${prop}\\\` not included in INCOMING_MODULE_JS_API\`
        );
      }
    }
    function isExportedByForceFilesystem(name) {
      return name === "FS_createPath" || name === "FS_createDataFile" || name === "FS_createPreloadedFile" || name === "FS_unlink" || name === "addRunDependency" || // The old FS has some functionality that WasmFS lacks.
      name === "FS_createLazyFile" || name === "FS_createDevice" || name === "removeRunDependency";
    }
    function hookGlobalSymbolAccess(sym, func) {
      if (typeof globalThis != "undefined" && !Object.getOwnPropertyDescriptor(globalThis, sym)) {
        Object.defineProperty(globalThis, sym, {
          configurable: true,
          get() {
            func();
            return void 0;
          }
        });
      }
    }
    function missingGlobal(sym, msg) {
      hookGlobalSymbolAccess(sym, () => {
        warnOnce(\`\\\`\${sym}\\\` is not longer defined by emscripten. \${msg}\`);
      });
    }
    missingGlobal("buffer", "Please use HEAP8.buffer or wasmMemory.buffer");
    missingGlobal("asm", "Please use wasmExports instead");
    function missingLibrarySymbol(sym) {
      hookGlobalSymbolAccess(sym, () => {
        var msg = \`\\\`\${sym}\\\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line\`;
        var librarySymbol = sym;
        if (!librarySymbol.startsWith("_")) {
          librarySymbol = "$" + sym;
        }
        msg += \` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='\${librarySymbol}')\`;
        if (isExportedByForceFilesystem(sym)) {
          msg += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
        }
        warnOnce(msg);
      });
      unexportedRuntimeSymbol(sym);
    }
    function unexportedRuntimeSymbol(sym) {
      if (!Object.getOwnPropertyDescriptor(Module, sym)) {
        Object.defineProperty(Module, sym, {
          configurable: true,
          get() {
            var msg = \`'\${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)\`;
            if (isExportedByForceFilesystem(sym)) {
              msg += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
            }
            abort(msg);
          }
        });
      }
    }
    var callRuntimeCallbacks = (callbacks) => {
      callbacks.forEach((f) => f(Module));
    };
    function getValue(ptr, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          return HEAP8[ptr];
        case "i8":
          return HEAP8[ptr];
        case "i16":
          return HEAP16[ptr >> 1];
        case "i32":
          return HEAP32[ptr >> 2];
        case "i64":
          abort("to do getValue(i64) use WASM_BIGINT");
        case "float":
          return HEAPF32[ptr >> 2];
        case "double":
          return HEAPF64[ptr >> 3];
        case "*":
          return HEAPU32[ptr >> 2];
        default:
          abort(\`invalid type for getValue: \${type}\`);
      }
    }
    Module["noExitRuntime"] || true;
    var ptrToString = (ptr) => {
      assert(typeof ptr === "number");
      ptr >>>= 0;
      return "0x" + ptr.toString(16).padStart(8, "0");
    };
    function setValue(ptr, value, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          HEAP8[ptr] = value;
          break;
        case "i8":
          HEAP8[ptr] = value;
          break;
        case "i16":
          HEAP16[ptr >> 1] = value;
          break;
        case "i32":
          HEAP32[ptr >> 2] = value;
          break;
        case "i64":
          abort("to do setValue(i64) use WASM_BIGINT");
        case "float":
          HEAPF32[ptr >> 2] = value;
          break;
        case "double":
          HEAPF64[ptr >> 3] = value;
          break;
        case "*":
          HEAPU32[ptr >> 2] = value;
          break;
        default:
          abort(\`invalid type for setValue: \${type}\`);
      }
    }
    var stackRestore = (val) => __emscripten_stack_restore(val);
    var stackSave = () => _emscripten_stack_get_current();
    var warnOnce = (text) => {
      warnOnce.shown || (warnOnce.shown = {});
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
      }
    };
    var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
    var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode((u0 & 31) << 6 | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = (u0 & 15) << 12 | u1 << 6 | u2;
        } else {
          if ((u0 & 248) != 240)
            warnOnce(
              "Invalid UTF-8 leading byte " + ptrToString(u0) + " encountered when deserializing a UTF-8 string in wasm memory to a JS string!"
            );
          u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        }
      }
      return str;
    };
    var UTF8ToString = (ptr, maxBytesToRead) => {
      assert(typeof ptr == "number", \`UTF8ToString expects a number (got \${typeof ptr})\`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
    };
    var ___assert_fail = (condition, filename, line, func) => {
      abort(
        \`Assertion failed: \${UTF8ToString(condition)}, at: \` + [
          filename ? UTF8ToString(filename) : "unknown filename",
          line,
          func ? UTF8ToString(func) : "unknown function"
        ]
      );
    };
    function syscallGetVarargI() {
      assert(SYSCALLS.varargs != void 0);
      var ret = HEAP32[+SYSCALLS.varargs >> 2];
      SYSCALLS.varargs += 4;
      return ret;
    }
    var syscallGetVarargP = syscallGetVarargI;
    var PATH = {
      isAbs: (path) => path.charAt(0) === "/",
      splitPath: (filename) => {
        var splitPathRe = /^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
      normalizeArray: (parts, allowAboveRoot) => {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === ".") {
            parts.splice(i, 1);
          } else if (last === "..") {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift("..");
          }
        }
        return parts;
      },
      normalize: (path) => {
        var isAbsolute = PATH.isAbs(path), trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(
          path.split("/").filter((p) => !!p),
          !isAbsolute
        ).join("/");
        if (!path && !isAbsolute) {
          path = ".";
        }
        if (path && trailingSlash) {
          path += "/";
        }
        return (isAbsolute ? "/" : "") + path;
      },
      dirname: (path) => {
        var result = PATH.splitPath(path), root = result[0], dir = result[1];
        if (!root && !dir) {
          return ".";
        }
        if (dir) {
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },
      basename: (path) => {
        if (path === "/") return "/";
        path = PATH.normalize(path);
        path = path.replace(/\\/$/, "");
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1);
      },
      join: (...paths) => PATH.normalize(paths.join("/")),
      join2: (l, r) => PATH.normalize(l + "/" + r)
    };
    var initRandomFill = () => {
      if (typeof crypto == "object" && typeof crypto["getRandomValues"] == "function") {
        return (view) => crypto.getRandomValues(view);
      }
      abort(
        "no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };"
      );
    };
    var randomFill = (view) => {
      return (randomFill = initRandomFill())(view);
    };
    var PATH_FS = {
      resolve: (...args) => {
        var resolvedPath = "", resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = i >= 0 ? args[i] : FS.cwd();
          if (typeof path != "string") {
            throw new TypeError("Arguments to path.resolve must be strings");
          } else if (!path) {
            return "";
          }
          resolvedPath = path + "/" + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        resolvedPath = PATH.normalizeArray(
          resolvedPath.split("/").filter((p) => !!p),
          !resolvedAbsolute
        ).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
      },
      relative: (from, to) => {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== "") break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== "") break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push("..");
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/");
      }
    };
    var FS_stdin_getChar_buffer = [];
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === "string", \`stringToUTF8Array expects a string (got \${typeof str})\`);
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = 65536 + ((u & 1023) << 10) | u1 & 1023;
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx) break;
          if (u > 1114111)
            warnOnce(
              "Invalid Unicode code point " + ptrToString(u) + " encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF)."
            );
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
    function intArrayFromString(stringy, dontAddNull, length) {
      var len = lengthBytesUTF8(stringy) + 1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
      u8array.length = numBytesWritten;
      return u8array;
    }
    var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (typeof window != "undefined" && typeof window.prompt == "function") {
          result = window.prompt("Input: ");
          if (result !== null) {
            result += "\\n";
          }
        } else if (typeof readline == "function") {
          result = readline();
          if (result) {
            result += "\\n";
          }
        } else ;
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result);
      }
      return FS_stdin_getChar_buffer.shift();
    };
    var TTY = {
      ttys: [],
      init() {
      },
      shutdown() {
      },
      register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
      stream_ops: {
        open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
        close(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
        fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
        read(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === void 0 && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === void 0) break;
            bytesRead++;
            buffer[offset + i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
        write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }
      },
      default_tty_ops: {
        get_char(tty) {
          return FS_stdin_getChar();
        },
        put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
        fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
        ioctl_tcgets(tty) {
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              3,
              28,
              127,
              21,
              4,
              0,
              1,
              0,
              17,
              19,
              26,
              0,
              18,
              15,
              23,
              22,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          };
        },
        ioctl_tcsets(tty, optional_actions, data) {
          return 0;
        },
        ioctl_tiocgwinsz(tty) {
          return [24, 80];
        }
      },
      default_tty1_ops: {
        put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
        fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        }
      }
    };
    var zeroMemory = (address, size) => {
      HEAPU8.fill(0, address, address + size);
    };
    var alignMemory = (size, alignment) => {
      assert(alignment, "alignment argument is required");
      return Math.ceil(size / alignment) * alignment;
    };
    var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (ptr) zeroMemory(ptr, size);
      return ptr;
    };
    var MEMFS = {
      ops_table: null,
      mount(mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0);
      },
      createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table || (MEMFS.ops_table = {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        });
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0;
          node.contents = null;
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        if (parent) {
          parent.contents[name] = node;
          parent.timestamp = node.timestamp;
        }
        return node;
      },
      getFileDataAsTypedArray(node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents);
      },
      expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(
          newCapacity,
          prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0
        );
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
      },
      resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null;
          node.usedBytes = 0;
        } else {
          var oldContents = node.contents;
          node.contents = new Uint8Array(newSize);
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
          }
          node.usedBytes = newSize;
        }
      },
      node_ops: {
        getattr(node) {
          var attr = {};
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
        setattr(node, attr) {
          if (attr.mode !== void 0) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== void 0) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== void 0) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
        lookup(parent, name) {
          throw FS.genericErrors[44];
        },
        mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
        rename(old_node, new_dir, new_name) {
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
          }
          delete old_node.parent.contents[old_node.name];
          old_node.parent.timestamp = Date.now();
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          new_dir.timestamp = old_node.parent.timestamp;
        },
        unlink(parent, name) {
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
        rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
        readdir(node) {
          var entries = [".", ".."];
          for (var key of Object.keys(node.contents)) {
            entries.push(key);
          }
          return entries;
        },
        symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
          node.link = oldpath;
          return node;
        },
        readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        }
      },
      stream_ops: {
        read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) {
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },
        write(stream, buffer, offset, length, position, canOwn) {
          assert(!(buffer instanceof ArrayBuffer));
          if (buffer.buffer === HEAP8.buffer) {
            canOwn = false;
          }
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
          if (buffer.subarray && (!node.contents || node.contents.subarray)) {
            if (canOwn) {
              assert(position === 0, "canOwn must imply no weird position inside the file");
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) {
              node.contents = buffer.slice(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) {
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
          MEMFS.expandFileStorage(node, position + length);
          if (node.contents.subarray && buffer.subarray) {
            node.contents.set(buffer.subarray(offset, offset + length), position);
          } else {
            for (var i = 0; i < length; i++) {
              node.contents[position + i] = buffer[offset + i];
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position + length);
          return length;
        },
        llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
        allocate(stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },
        mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            if (contents) {
              if (position > 0 || position + length < contents.length) {
                if (contents.subarray) {
                  contents = contents.subarray(position, position + length);
                } else {
                  contents = Array.prototype.slice.call(contents, position, position + length);
                }
              }
              HEAP8.set(contents, ptr);
            }
          }
          return { ptr, allocated };
        },
        msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          return 0;
        }
      }
    };
    var asyncLoad = (url, onload, onerror, noRunDep) => {
      var dep = getUniqueRunDependency(\`al \${url}\`);
      readAsync(url).then(
        (arrayBuffer) => {
          assert(arrayBuffer, \`Loading data file "\${url}" failed (no arrayBuffer).\`);
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        (err2) => {
          if (onerror) {
            onerror();
          } else {
            throw \`Loading data file "\${url}" failed.\`;
          }
        }
      );
      if (dep) addRunDependency(dep);
    };
    var FS_createDataFile = (parent, name, fileData, canRead, canWrite, canOwn) => {
      FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
    };
    var preloadPlugins = Module["preloadPlugins"] || [];
    var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      if (typeof Browser != "undefined") Browser.init();
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin["canHandle"](fullname)) {
          plugin["handle"](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
    var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(\`cp \${fullname}\`);
      function processData(byteArray) {
        function finish(byteArray2) {
          preFinish == null ? void 0 : preFinish();
          if (!dontCreateFile) {
            FS_createDataFile(parent, name, byteArray2, canRead, canWrite, canOwn);
          }
          onload == null ? void 0 : onload();
          removeRunDependency(dep);
        }
        if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
          onerror == null ? void 0 : onerror();
          removeRunDependency(dep);
        })) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == "string") {
        asyncLoad(url, processData, onerror);
      } else {
        processData(url);
      }
    };
    var FS_modeStringToFlags = (str) => {
      var flagModes = {
        r: 0,
        "r+": 2,
        w: 512 | 64 | 1,
        "w+": 512 | 64 | 2,
        a: 1024 | 64 | 1,
        "a+": 1024 | 64 | 2
      };
      var flags = flagModes[str];
      if (typeof flags == "undefined") {
        throw new Error(\`Unknown file open mode: \${str}\`);
      }
      return flags;
    };
    var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
    var strError = (errno) => {
      return UTF8ToString(_strerror(errno));
    };
    var ERRNO_CODES = {
      EPERM: 63,
      ENOENT: 44,
      ESRCH: 71,
      EINTR: 27,
      EIO: 29,
      ENXIO: 60,
      E2BIG: 1,
      ENOEXEC: 45,
      EBADF: 8,
      ECHILD: 12,
      EAGAIN: 6,
      EWOULDBLOCK: 6,
      ENOMEM: 48,
      EACCES: 2,
      EFAULT: 21,
      ENOTBLK: 105,
      EBUSY: 10,
      EEXIST: 20,
      EXDEV: 75,
      ENODEV: 43,
      ENOTDIR: 54,
      EISDIR: 31,
      EINVAL: 28,
      ENFILE: 41,
      EMFILE: 33,
      ENOTTY: 59,
      ETXTBSY: 74,
      EFBIG: 22,
      ENOSPC: 51,
      ESPIPE: 70,
      EROFS: 69,
      EMLINK: 34,
      EPIPE: 64,
      EDOM: 18,
      ERANGE: 68,
      ENOMSG: 49,
      EIDRM: 24,
      ECHRNG: 106,
      EL2NSYNC: 156,
      EL3HLT: 107,
      EL3RST: 108,
      ELNRNG: 109,
      EUNATCH: 110,
      ENOCSI: 111,
      EL2HLT: 112,
      EDEADLK: 16,
      ENOLCK: 46,
      EBADE: 113,
      EBADR: 114,
      EXFULL: 115,
      ENOANO: 104,
      EBADRQC: 103,
      EBADSLT: 102,
      EDEADLOCK: 16,
      EBFONT: 101,
      ENOSTR: 100,
      ENODATA: 116,
      ETIME: 117,
      ENOSR: 118,
      ENONET: 119,
      ENOPKG: 120,
      EREMOTE: 121,
      ENOLINK: 47,
      EADV: 122,
      ESRMNT: 123,
      ECOMM: 124,
      EPROTO: 65,
      EMULTIHOP: 36,
      EDOTDOT: 125,
      EBADMSG: 9,
      ENOTUNIQ: 126,
      EBADFD: 127,
      EREMCHG: 128,
      ELIBACC: 129,
      ELIBBAD: 130,
      ELIBSCN: 131,
      ELIBMAX: 132,
      ELIBEXEC: 133,
      ENOSYS: 52,
      ENOTEMPTY: 55,
      ENAMETOOLONG: 37,
      ELOOP: 32,
      EOPNOTSUPP: 138,
      EPFNOSUPPORT: 139,
      ECONNRESET: 15,
      ENOBUFS: 42,
      EAFNOSUPPORT: 5,
      EPROTOTYPE: 67,
      ENOTSOCK: 57,
      ENOPROTOOPT: 50,
      ESHUTDOWN: 140,
      ECONNREFUSED: 14,
      EADDRINUSE: 3,
      ECONNABORTED: 13,
      ENETUNREACH: 40,
      ENETDOWN: 38,
      ETIMEDOUT: 73,
      EHOSTDOWN: 142,
      EHOSTUNREACH: 23,
      EINPROGRESS: 26,
      EALREADY: 7,
      EDESTADDRREQ: 17,
      EMSGSIZE: 35,
      EPROTONOSUPPORT: 66,
      ESOCKTNOSUPPORT: 137,
      EADDRNOTAVAIL: 4,
      ENETRESET: 39,
      EISCONN: 30,
      ENOTCONN: 53,
      ETOOMANYREFS: 141,
      EUSERS: 136,
      EDQUOT: 19,
      ESTALE: 72,
      ENOTSUP: 138,
      ENOMEDIUM: 148,
      EILSEQ: 25,
      EOVERFLOW: 61,
      ECANCELED: 11,
      ENOTRECOVERABLE: 56,
      EOWNERDEAD: 62,
      ESTRPIPE: 135
    };
    var FS = {
      root: null,
      mounts: [],
      devices: {},
      streams: [],
      nextInode: 1,
      nameTable: null,
      currentPath: "/",
      initialized: false,
      ignorePermissions: true,
      ErrnoError: class extends Error {
        // We set the \`name\` property to be able to identify \`FS.ErrnoError\`
        // - the \`name\` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test \`err instanceof FS.ErrnoError\` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test \`err.name == "ErrnoError"\` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : "");
          this.name = "ErrnoError";
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
      genericErrors: {},
      filesystems: null,
      syncFSRequests: 0,
      readFiles: {},
      FSStream: class {
        constructor() {
          this.shared = {};
        }
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return this.flags & 1024;
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
      FSNode: class {
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
          this.readMode = 292 | 73;
          this.writeMode = 146;
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
      },
      lookupPath(path, opts = {}) {
        path = PATH_FS.resolve(path);
        if (!path) return { path: "", node: null };
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        opts = Object.assign(defaults, opts);
        if (opts.recurse_count > 8) {
          throw new FS.ErrnoError(32);
        }
        var parts = path.split("/").filter((p) => !!p);
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
          var islast = i === parts.length - 1;
          if (islast && opts.parent) {
            break;
          }
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
          if (FS.isMountpoint(current)) {
            if (!islast || islast && opts.follow_mount) {
              current = current.mounted.root;
            }
          }
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count + 1 });
              current = lookup.node;
              if (count++ > 40) {
                throw new FS.ErrnoError(32);
              }
            }
          }
        }
        return { path: current_path, node: current };
      },
      getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length - 1] !== "/" ? \`\${mount}/\${path}\` : mount + path;
          }
          path = path ? \`\${node.name}/\${path}\` : node.name;
          node = node.parent;
        }
      },
      hashName(parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
          hash = (hash << 5) - hash + name.charCodeAt(i) | 0;
        }
        return (parentid + hash >>> 0) % FS.nameTable.length;
      },
      hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
      hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
      lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        return FS.lookup(parent, name);
      },
      createNode(parent, name, mode, rdev) {
        assert(typeof parent == "object");
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node;
      },
      destroyNode(node) {
        FS.hashRemoveNode(node);
      },
      isRoot(node) {
        return node === node.parent;
      },
      isMountpoint(node) {
        return !!node.mounted;
      },
      isFile(mode) {
        return (mode & 61440) === 32768;
      },
      isDir(mode) {
        return (mode & 61440) === 16384;
      },
      isLink(mode) {
        return (mode & 61440) === 40960;
      },
      isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
      isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
      isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
      isSocket(mode) {
        return (mode & 49152) === 49152;
      },
      flagsToPermissionString(flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
          perms += "w";
        }
        return perms;
      },
      nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        if (perms.includes("r") && !(node.mode & 292)) {
          return 2;
        } else if (perms.includes("w") && !(node.mode & 146)) {
          return 2;
        } else if (perms.includes("x") && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
      mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, "x");
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
      mayCreate(dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, "wx");
      },
      mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, "wx");
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return 31;
          }
        }
        return 0;
      },
      mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== "r" || // opening for write
          flags & 512) {
            return 31;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },
      MAX_OPEN_FDS: 4096,
      nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
      getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
      getStream: (fd) => FS.streams[fd],
      createStream(stream, fd = -1) {
        assert(fd >= -1);
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
      closeStream(fd) {
        FS.streams[fd] = null;
      },
      dupStream(origStream, fd = -1) {
        var _a, _b;
        var stream = FS.createStream(origStream, fd);
        (_b = (_a = stream.stream_ops) == null ? void 0 : _a.dup) == null ? void 0 : _b.call(_a, stream);
        return stream;
      },
      chrdev_stream_ops: {
        open(stream) {
          var _a, _b;
          var device = FS.getDevice(stream.node.rdev);
          stream.stream_ops = device.stream_ops;
          (_b = (_a = stream.stream_ops).open) == null ? void 0 : _b.call(_a, stream);
        },
        llseek() {
          throw new FS.ErrnoError(70);
        }
      },
      major: (dev) => dev >> 8,
      minor: (dev) => dev & 255,
      makedev: (ma, mi) => ma << 8 | mi,
      registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
      getDevice: (dev) => FS.devices[dev],
      getMounts(mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
          var m = check.pop();
          mounts.push(m);
          check.push(...m.mounts);
        }
        return mounts;
      },
      syncfs(populate, callback) {
        if (typeof populate == "function") {
          callback = populate;
          populate = false;
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
          err(
            \`warning: \${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work\`
          );
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        }
        mounts.forEach((mount) => {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },
      mount(type, opts, mountpoint) {
        if (typeof type == "string") {
          throw type;
        }
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
          mountpoint = lookup.path;
          node = lookup.node;
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          node.mounted = mount;
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
        return mountRoot;
      },
      unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach((hash) => {
          var current = FS.nameTable[hash];
          while (current) {
            var next = current.name_next;
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
            current = next;
          }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
      lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
      mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
      create(path, mode) {
        mode = mode !== void 0 ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
      mkdir(path, mode) {
        mode = mode !== void 0 ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
      mkdirTree(path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += "/" + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch (e) {
            if (e.errno != 20) throw e;
          }
        }
      },
      mkdev(path, mode, dev) {
        if (typeof dev == "undefined") {
          dev = mode;
          mode = 438;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
      symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
      rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
          throw new FS.ErrnoError(28);
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
          throw new FS.ErrnoError(55);
        }
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
        }
        if (old_node === new_node) {
          return;
        }
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
          throw new FS.ErrnoError(10);
        }
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, "w");
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        FS.hashRemoveNode(old_node);
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          FS.hashAddNode(old_node);
        }
      },
      rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
      readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(54);
        }
        return node.node_ops.readdir(node);
      },
      unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
      readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },
      stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(63);
        }
        return node.node_ops.getattr(node);
      },
      lstat(path) {
        return FS.stat(path, true);
      },
      chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          mode: mode & 4095 | node.mode & -4096,
          timestamp: Date.now()
        });
      },
      lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
      fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.chmod(stream.node, mode);
      },
      chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },
      lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
      fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.chown(stream.node, uid, gid);
      },
      truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == "string") {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, "w");
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },
      ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.truncate(stream.node, len);
      },
      utime(path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },
      open(path, flags, mode) {
        if (path === "") {
          throw new FS.ErrnoError(44);
        }
        flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
        if (flags & 64) {
          mode = typeof mode == "undefined" ? 438 : mode;
          mode = mode & 4095 | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path == "object") {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
          }
        }
        var created = false;
        if (flags & 64) {
          if (node) {
            if (flags & 128) {
              throw new FS.ErrnoError(20);
            }
          } else {
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (FS.isChrdev(node.mode)) {
          flags &= -513;
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        if (flags & 512 && !created) {
          FS.truncate(node, 0);
        }
        flags &= -131713;
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),
          // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
          }
        }
        return stream;
      },
      close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null;
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
      isClosed(stream) {
        return stream.fd === null;
      },
      llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
      read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
      write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != "undefined";
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(
          stream,
          buffer,
          offset,
          length,
          position,
          canOwn
        );
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
      allocate(stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(28);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(138);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },
      mmap(stream, length, position, prot, flags) {
        if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        if (!length) {
          throw new FS.ErrnoError(28);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
      msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
      ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
      readFile(path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
          throw new Error(\`Invalid encoding type "\${opts.encoding}"\`);
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
          ret = UTF8ArrayToString(buf);
        } else if (opts.encoding === "binary") {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },
      writeFile(path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data == "string") {
          var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, void 0, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, void 0, opts.canOwn);
        } else {
          throw new Error("Unsupported data type");
        }
        FS.close(stream);
      },
      cwd: () => FS.currentPath,
      chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, "x");
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
      createDefaultDirectories() {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user");
      },
      createDefaultDevices() {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (randomLeft === 0) {
            randomLeft = randomFill(randomBuffer).byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice("/dev", "random", randomByte);
        FS.createDevice("/dev", "urandom", randomByte);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp");
      },
      createSpecialDirectories() {
        FS.mkdir("/proc");
        var proc_self = FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount(
          {
            mount() {
              var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
              node.node_ops = {
                lookup(parent, name) {
                  var fd = +name;
                  var stream = FS.getStreamChecked(fd);
                  var ret = {
                    parent: null,
                    mount: { mountpoint: "fake" },
                    node_ops: { readlink: () => stream.path }
                  };
                  ret.parent = ret;
                  return ret;
                }
              };
              return node;
            }
          },
          {},
          "/proc/self/fd"
        );
      },
      createStandardStreams(input, output, error) {
        if (input) {
          FS.createDevice("/dev", "stdin", input);
        } else {
          FS.symlink("/dev/tty", "/dev/stdin");
        }
        if (output) {
          FS.createDevice("/dev", "stdout", null, output);
        } else {
          FS.symlink("/dev/tty", "/dev/stdout");
        }
        if (error) {
          FS.createDevice("/dev", "stderr", null, error);
        } else {
          FS.symlink("/dev/tty1", "/dev/stderr");
        }
        var stdin = FS.open("/dev/stdin", 0);
        var stdout = FS.open("/dev/stdout", 1);
        var stderr = FS.open("/dev/stderr", 1);
        assert(stdin.fd === 0, \`invalid handle for stdin (\${stdin.fd})\`);
        assert(stdout.fd === 1, \`invalid handle for stdout (\${stdout.fd})\`);
        assert(stderr.fd === 2, \`invalid handle for stderr (\${stderr.fd})\`);
      },
      staticInit() {
        [44].forEach((code) => {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = "<generic error, no stack>";
        });
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = {
          MEMFS
        };
      },
      init(input, output, error) {
        assert(
          !FS.initialized,
          "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)"
        );
        FS.initialized = true;
        input ?? (input = Module["stdin"]);
        output ?? (output = Module["stdout"]);
        error ?? (error = Module["stderr"]);
        FS.createStandardStreams(input, output, error);
      },
      quit() {
        FS.initialized = false;
        _fflush(0);
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },
      findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
      analyzePath(path, dontResolveLastLink) {
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false,
          exists: false,
          error: 0,
          name: null,
          path: null,
          object: null,
          parentExists: false,
          parentPath: null,
          parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === "/";
        } catch (e) {
          ret.error = e.errno;
        }
        return ret;
      },
      createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
          }
          parent = current;
        }
        return current;
      },
      createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
      createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == "string" ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data == "string") {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
      createDevice(parent, name, input, output) {
        var _a;
        var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        (_a = FS.createDevice).major ?? (_a.major = 64);
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            var _a2;
            if ((_a2 = output == null ? void 0 : output.buffer) == null ? void 0 : _a2.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === void 0 && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === void 0) break;
              bytesRead++;
              buffer[offset + i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset + i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
      forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (typeof XMLHttpRequest != "undefined") {
          throw new Error(
            "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread."
          );
        } else {
          try {
            obj.contents = readBinary(obj.url);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
      createLazyFile(parent, name, url, canRead, canWrite) {
        class LazyUint8Array {
          constructor() {
            this.lengthKnown = false;
            this.chunks = [];
          }
          get(idx) {
            if (idx > this.length - 1 || idx < 0) {
              return void 0;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = idx / this.chunkSize | 0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            var xhr = new XMLHttpRequest();
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304))
              throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = (from, to) => {
              if (from > to)
                throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
              if (to > datalength - 1)
                throw new Error("only " + datalength + " bytes available! programmer error!");
              var xhr2 = new XMLHttpRequest();
              xhr2.open("GET", url, false);
              if (datalength !== chunkSize)
                xhr2.setRequestHeader("Range", "bytes=" + from + "-" + to);
              xhr2.responseType = "arraybuffer";
              if (xhr2.overrideMimeType) {
                xhr2.overrideMimeType("text/plain; charset=x-user-defined");
              }
              xhr2.send(null);
              if (!(xhr2.status >= 200 && xhr2.status < 300 || xhr2.status === 304))
                throw new Error("Couldn't load " + url + ". Status: " + xhr2.status);
              if (xhr2.response !== void 0) {
                return new Uint8Array(
                  /** @type{Array<number>} */
                  xhr2.response || []
                );
              }
              return intArrayFromString(xhr2.responseText || "");
            };
            var lazyArray2 = this;
            lazyArray2.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum + 1) * chunkSize - 1;
              end = Math.min(end, datalength - 1);
              if (typeof lazyArray2.chunks[chunkNum] == "undefined") {
                lazyArray2.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray2.chunks[chunkNum] == "undefined")
                throw new Error("doXHR failed!");
              return lazyArray2.chunks[chunkNum];
            });
            if (usesGzip || !datalength) {
              chunkSize = datalength = 1;
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out("LazyFiles on gzip forces download of the whole file when length is accessed");
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
        if (typeof XMLHttpRequest != "undefined") {
          if (!ENVIRONMENT_IS_WORKER)
            throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url };
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        Object.defineProperties(node, {
          usedBytes: {
            get: function() {
              return this.contents.length;
            }
          }
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((key) => {
          var fn = node.stream_ops[key];
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        });
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length) return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) {
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position);
        };
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
      absolutePath() {
        abort("FS.absolutePath has been removed; use PATH_FS.resolve instead");
      },
      createFolder() {
        abort("FS.createFolder has been removed; use FS.mkdir instead");
      },
      createLink() {
        abort("FS.createLink has been removed; use FS.symlink instead");
      },
      joinPath() {
        abort("FS.joinPath has been removed; use PATH.join instead");
      },
      mmapAlloc() {
        abort("FS.mmapAlloc has been replaced by the top level function mmapAlloc");
      },
      standardizePath() {
        abort("FS.standardizePath has been removed; use PATH.normalize instead");
      }
    };
    var SYSCALLS = {
      DEFAULT_POLLMASK: 5,
      calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);
          }
          return dir;
        }
        return PATH.join2(dir, path);
      },
      doStat(func, path, buf) {
        var stat = func(path);
        HEAP32[buf >> 2] = stat.dev;
        HEAP32[buf + 4 >> 2] = stat.mode;
        HEAPU32[buf + 8 >> 2] = stat.nlink;
        HEAP32[buf + 12 >> 2] = stat.uid;
        HEAP32[buf + 16 >> 2] = stat.gid;
        HEAP32[buf + 20 >> 2] = stat.rdev;
        tempI64 = [
          stat.size >>> 0,
          (tempDouble = stat.size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[buf + 24 >> 2] = tempI64[0], HEAP32[buf + 28 >> 2] = tempI64[1];
        HEAP32[buf + 32 >> 2] = 4096;
        HEAP32[buf + 36 >> 2] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        tempI64 = [
          Math.floor(atime / 1e3) >>> 0,
          (tempDouble = Math.floor(atime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[buf + 40 >> 2] = tempI64[0], HEAP32[buf + 44 >> 2] = tempI64[1];
        HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
        tempI64 = [
          Math.floor(mtime / 1e3) >>> 0,
          (tempDouble = Math.floor(mtime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[buf + 56 >> 2] = tempI64[0], HEAP32[buf + 60 >> 2] = tempI64[1];
        HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
        tempI64 = [
          Math.floor(ctime / 1e3) >>> 0,
          (tempDouble = Math.floor(ctime / 1e3), +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[buf + 72 >> 2] = tempI64[0], HEAP32[buf + 76 >> 2] = tempI64[1];
        HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
        tempI64 = [
          stat.ino >>> 0,
          (tempDouble = stat.ino, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[buf + 88 >> 2] = tempI64[0], HEAP32[buf + 92 >> 2] = tempI64[1];
        return 0;
      },
      doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          return 0;
        }
        var buffer = HEAPU8.slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
      getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
      varargs: void 0,
      getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      }
    };
    function ___syscall_fcntl64(fd, cmd, varargs) {
      SYSCALLS.varargs = varargs;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (cmd) {
          case 0: {
            var arg = syscallGetVarargI();
            if (arg < 0) {
              return -28;
            }
            while (FS.streams[arg]) {
              arg++;
            }
            var newStream;
            newStream = FS.dupStream(stream, arg);
            return newStream.fd;
          }
          case 1:
          case 2:
            return 0;
          // FD_CLOEXEC makes no sense for a single process.
          case 3:
            return stream.flags;
          case 4: {
            var arg = syscallGetVarargI();
            stream.flags |= arg;
            return 0;
          }
          case 12: {
            var arg = syscallGetVarargP();
            var offset = 0;
            HEAP16[arg + offset >> 1] = 2;
            return 0;
          }
          case 13:
          case 14:
            return 0;
        }
        return -28;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_fstat64(fd, buf) {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        return SYSCALLS.doStat(FS.stat, stream.path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var convertI32PairToI53Checked = (lo, hi) => {
      assert(lo == lo >>> 0 || lo == (lo | 0));
      assert(hi === (hi | 0));
      return hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;
    };
    function ___syscall_ftruncate64(fd, length_low, length_high) {
      var length = convertI32PairToI53Checked(length_low, length_high);
      try {
        if (isNaN(length)) return 61;
        FS.ftruncate(fd, length);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(
        typeof maxBytesToWrite == "number",
        "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!"
      );
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
    function ___syscall_getdents64(fd, dirp, count) {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        stream.getdents || (stream.getdents = FS.readdir(stream.path));
        var struct_size = 280;
        var pos = 0;
        var off = FS.llseek(stream, 0, 1);
        var idx = Math.floor(off / struct_size);
        while (idx < stream.getdents.length && pos + struct_size <= count) {
          var id;
          var type;
          var name = stream.getdents[idx];
          if (name === ".") {
            id = stream.node.id;
            type = 4;
          } else if (name === "..") {
            var lookup = FS.lookupPath(stream.path, { parent: true });
            id = lookup.node.id;
            type = 4;
          } else {
            var child = FS.lookupNode(stream.node, name);
            id = child.id;
            type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8;
          }
          assert(id);
          tempI64 = [
            id >>> 0,
            (tempDouble = id, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
          ], HEAP32[dirp + pos >> 2] = tempI64[0], HEAP32[dirp + pos + 4 >> 2] = tempI64[1];
          tempI64 = [
            (idx + 1) * struct_size >>> 0,
            (tempDouble = (idx + 1) * struct_size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
          ], HEAP32[dirp + pos + 8 >> 2] = tempI64[0], HEAP32[dirp + pos + 12 >> 2] = tempI64[1];
          HEAP16[dirp + pos + 16 >> 1] = 280;
          HEAP8[dirp + pos + 18] = type;
          stringToUTF8(name, dirp + pos + 19, 256);
          pos += struct_size;
          idx += 1;
        }
        FS.llseek(stream, idx * struct_size, 0);
        return pos;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_ioctl(fd, op, varargs) {
      SYSCALLS.varargs = varargs;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (op) {
          case 21509: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21505: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tcgets) {
              var termios = stream.tty.ops.ioctl_tcgets(stream);
              var argp = syscallGetVarargP();
              HEAP32[argp >> 2] = termios.c_iflag || 0;
              HEAP32[argp + 4 >> 2] = termios.c_oflag || 0;
              HEAP32[argp + 8 >> 2] = termios.c_cflag || 0;
              HEAP32[argp + 12 >> 2] = termios.c_lflag || 0;
              for (var i = 0; i < 32; i++) {
                HEAP8[argp + i + 17] = termios.c_cc[i] || 0;
              }
              return 0;
            }
            return 0;
          }
          case 21510:
          case 21511:
          case 21512: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21506:
          case 21507:
          case 21508: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tcsets) {
              var argp = syscallGetVarargP();
              var c_iflag = HEAP32[argp >> 2];
              var c_oflag = HEAP32[argp + 4 >> 2];
              var c_cflag = HEAP32[argp + 8 >> 2];
              var c_lflag = HEAP32[argp + 12 >> 2];
              var c_cc = [];
              for (var i = 0; i < 32; i++) {
                c_cc.push(HEAP8[argp + i + 17]);
              }
              return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
                c_iflag,
                c_oflag,
                c_cflag,
                c_lflag,
                c_cc
              });
            }
            return 0;
          }
          case 21519: {
            if (!stream.tty) return -59;
            var argp = syscallGetVarargP();
            HEAP32[argp >> 2] = 0;
            return 0;
          }
          case 21520: {
            if (!stream.tty) return -59;
            return -28;
          }
          case 21531: {
            var argp = syscallGetVarargP();
            return FS.ioctl(stream, op, argp);
          }
          case 21523: {
            if (!stream.tty) return -59;
            if (stream.tty.ops.ioctl_tiocgwinsz) {
              var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
              var argp = syscallGetVarargP();
              HEAP16[argp >> 1] = winsize[0];
              HEAP16[argp + 2 >> 1] = winsize[1];
            }
            return 0;
          }
          case 21524: {
            if (!stream.tty) return -59;
            return 0;
          }
          case 21515: {
            if (!stream.tty) return -59;
            return 0;
          }
          default:
            return -28;
        }
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_lstat64(path, buf) {
      try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.doStat(FS.lstat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_newfstatat(dirfd, path, buf, flags) {
      try {
        path = SYSCALLS.getStr(path);
        var nofollow = flags & 256;
        var allowEmpty = flags & 4096;
        flags = flags & ~6400;
        assert(!flags, \`unknown flags in __syscall_newfstatat: \${flags}\`);
        path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
        return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_openat(dirfd, path, flags, varargs) {
      SYSCALLS.varargs = varargs;
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        var mode = varargs ? syscallGetVarargI() : 0;
        return FS.open(path, flags, mode).fd;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_rmdir(path) {
      try {
        path = SYSCALLS.getStr(path);
        FS.rmdir(path);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_stat64(path, buf) {
      try {
        path = SYSCALLS.getStr(path);
        return SYSCALLS.doStat(FS.stat, path, buf);
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    function ___syscall_unlinkat(dirfd, path, flags) {
      try {
        path = SYSCALLS.getStr(path);
        path = SYSCALLS.calculateAt(dirfd, path);
        if (flags === 0) {
          FS.unlink(path);
        } else if (flags === 512) {
          FS.rmdir(path);
        } else {
          abort("Invalid flags passed to unlinkat");
        }
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return -e.errno;
      }
    }
    var __abort_js = () => {
      abort("native code called abort()");
    };
    var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);
    var __emscripten_throw_longjmp = () => {
      throw Infinity;
    };
    function __gmtime_js(time_low, time_high, tmPtr) {
      var time = convertI32PairToI53Checked(time_low, time_high);
      var date = new Date(time * 1e3);
      HEAP32[tmPtr >> 2] = date.getUTCSeconds();
      HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
      HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
      HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
      HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
      HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
      HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
      var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
      HEAP32[tmPtr + 28 >> 2] = yday;
    }
    var isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
      return yday;
    };
    function __localtime_js(time_low, time_high, tmPtr) {
      var time = convertI32PairToI53Checked(time_low, time_high);
      var date = new Date(time * 1e3);
      HEAP32[tmPtr >> 2] = date.getSeconds();
      HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
      HEAP32[tmPtr + 8 >> 2] = date.getHours();
      HEAP32[tmPtr + 12 >> 2] = date.getDate();
      HEAP32[tmPtr + 16 >> 2] = date.getMonth();
      HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
      HEAP32[tmPtr + 24 >> 2] = date.getDay();
      var yday = ydayFromDate(date) | 0;
      HEAP32[tmPtr + 28 >> 2] = yday;
      HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
      HEAP32[tmPtr + 32 >> 2] = dst;
    }
    var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      var currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
      HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
      HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
      var extractZone = (timezoneOffset) => {
        var sign = timezoneOffset >= 0 ? "-" : "+";
        var absOffset = Math.abs(timezoneOffset);
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
        return \`UTC\${sign}\${hours}\${minutes}\`;
      };
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      assert(winterName);
      assert(summerName);
      assert(
        lengthBytesUTF8(winterName) <= 16,
        \`timezone name truncated to fit in TZNAME_MAX (\${winterName})\`
      );
      assert(
        lengthBytesUTF8(summerName) <= 16,
        \`timezone name truncated to fit in TZNAME_MAX (\${summerName})\`
      );
      if (summerOffset < winterOffset) {
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };
    var _emscripten_date_now = () => Date.now();
    var getHeapMax = () => (
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648
    );
    var growMemory = (size) => {
      var b = wasmMemory.buffer;
      var pages = (size - b.byteLength + 65535) / 65536 | 0;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {
        err(
          \`growMemory: Attempted to grow heap from \${b.byteLength} bytes to \${size} bytes, but got error: \${e}\`
        );
      }
    };
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      assert(requestedSize > oldSize);
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        err(
          \`Cannot enlarge memory, requested \${requestedSize} bytes, but the limit is \${maxHeapSize} bytes!\`
        );
        return false;
      }
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(
          maxHeapSize,
          alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)
        );
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      err(\`Failed to grow the heap from \${oldSize} bytes to \${newSize} bytes, not enough memory!\`);
      return false;
    };
    var ENV = {};
    var getExecutableName = () => {
      return thisProgram || "./this.program";
    };
    var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        var lang = (typeof navigator == "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
        var env = {
          USER: "web_user",
          LOGNAME: "web_user",
          PATH: "/",
          PWD: "/",
          HOME: "/home/web_user",
          LANG: lang,
          _: getExecutableName()
        };
        for (var x in ENV) {
          if (ENV[x] === void 0) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(\`\${x}=\${env[x]}\`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
    var stringToAscii = (str, buffer) => {
      for (var i = 0; i < str.length; ++i) {
        assert(str.charCodeAt(i) === (str.charCodeAt(i) & 255));
        HEAP8[buffer++] = str.charCodeAt(i);
      }
      HEAP8[buffer] = 0;
    };
    var _environ_get = (__environ, environ_buf) => {
      var bufSize = 0;
      getEnvStrings().forEach((string, i) => {
        var ptr = environ_buf + bufSize;
        HEAPU32[__environ + i * 4 >> 2] = ptr;
        stringToAscii(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    };
    var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
      var strings = getEnvStrings();
      HEAPU32[penviron_count >> 2] = strings.length;
      var bufSize = 0;
      strings.forEach((string) => bufSize += string.length + 1);
      HEAPU32[penviron_buf_size >> 2] = bufSize;
      return 0;
    };
    function _fd_close(fd) {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.close(stream);
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break;
      }
      return ret;
    };
    function _fd_read(fd, iov, iovcnt, pnum) {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doReadv(stream, iov, iovcnt);
        HEAPU32[pnum >> 2] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      try {
        if (isNaN(offset)) return 61;
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.llseek(stream, offset, whence);
        tempI64 = [
          stream.position >>> 0,
          (tempDouble = stream.position, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)
        ], HEAP32[newOffset >> 2] = tempI64[0], HEAP32[newOffset + 4 >> 2] = tempI64[1];
        if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    function _fd_sync(fd) {
      var _a;
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        if ((_a = stream.stream_ops) == null ? void 0 : _a.fsync) {
          return stream.stream_ops.fsync(stream);
        }
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    var doWritev = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2];
        var len = HEAPU32[iov + 4 >> 2];
        iov += 8;
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) {
          break;
        }
      }
      return ret;
    };
    function _fd_write(fd, iov, iovcnt, pnum) {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = doWritev(stream, iov, iovcnt);
        HEAPU32[pnum >> 2] = num;
        return 0;
      } catch (e) {
        if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
        return e.errno;
      }
    }
    var wasmTableMirror = [];
    var wasmTable;
    var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      assert(
        wasmTable.get(funcPtr) == func,
        "JavaScript-side Wasm function table mirror is out of date!"
      );
      return func;
    };
    var UTF16Decoder = typeof TextDecoder != "undefined" ? new TextDecoder("utf-16le") : void 0;
    var UTF16ToString = (ptr, maxBytesToRead) => {
      assert(ptr % 2 == 0, "Pointer passed to UTF16ToString must be aligned to two bytes!");
      var endPtr = ptr;
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
      endPtr = idx << 1;
      if (endPtr - ptr > 32 && UTF16Decoder)
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
      var str = "";
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[ptr + i * 2 >> 1];
        if (codeUnit == 0) break;
        str += String.fromCharCode(codeUnit);
      }
      return str;
    };
    var uleb128Encode = (n, target) => {
      assert(n < 16384);
      if (n < 128) {
        target.push(n);
      } else {
        target.push(n % 128 | 128, n >> 7);
      }
    };
    var sigToWasmTypes = (sig) => {
      assert(
        !sig.includes("j"),
        "i64 not permitted in function signatures when WASM_BIGINT is disabled"
      );
      var typeNames = {
        i: "i32",
        j: "i64",
        f: "f32",
        d: "f64",
        e: "externref",
        p: "i32"
      };
      var type = {
        parameters: [],
        results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
      };
      for (var i = 1; i < sig.length; ++i) {
        assert(sig[i] in typeNames, "invalid signature char: " + sig[i]);
        type.parameters.push(typeNames[sig[i]]);
      }
      return type;
    };
    var generateFuncType = (sig, target) => {
      var sigRet = sig.slice(0, 1);
      var sigParam = sig.slice(1);
      var typeCodes = {
        i: 127,
        // i32
        p: 127,
        // i32
        j: 126,
        // i64
        f: 125,
        // f32
        d: 124,
        // f64
        e: 111
        // externref
      };
      target.push(
        96
        /* form: func */
      );
      uleb128Encode(sigParam.length, target);
      for (var i = 0; i < sigParam.length; ++i) {
        assert(sigParam[i] in typeCodes, "invalid signature char: " + sigParam[i]);
        target.push(typeCodes[sigParam[i]]);
      }
      if (sigRet == "v") {
        target.push(0);
      } else {
        target.push(1, typeCodes[sigRet]);
      }
    };
    var convertJsFunctionToWasm = (func, sig) => {
      assert(
        !sig.includes("j"),
        "i64 not permitted in function signatures when WASM_BIGINT is disabled"
      );
      if (typeof WebAssembly.Function == "function") {
        return new WebAssembly.Function(sigToWasmTypes(sig), func);
      }
      var typeSectionBody = [
        1
        // count: 1
      ];
      generateFuncType(sig, typeSectionBody);
      var bytes = [
        0,
        97,
        115,
        109,
        // magic ("\\0asm")
        1,
        0,
        0,
        0,
        // version: 1
        1
        // Type section code
      ];
      uleb128Encode(typeSectionBody.length, bytes);
      bytes.push(...typeSectionBody);
      bytes.push(
        2,
        7,
        // import section
        // (import "e" "f" (func 0 (type 0)))
        1,
        1,
        101,
        1,
        102,
        0,
        0,
        7,
        5,
        // export section
        // (export "f" (func 0 (type 0)))
        1,
        1,
        102,
        0,
        0
      );
      var module = new WebAssembly.Module(new Uint8Array(bytes));
      var instance = new WebAssembly.Instance(module, { e: { f: func } });
      var wrappedFunc = instance.exports["f"];
      return wrappedFunc;
    };
    var updateTableMap = (offset, count) => {
      if (functionsInTableMap) {
        for (var i = offset; i < offset + count; i++) {
          var item = getWasmTableEntry(i);
          if (item) {
            functionsInTableMap.set(item, i);
          }
        }
      }
    };
    var functionsInTableMap;
    var getFunctionAddress = (func) => {
      if (!functionsInTableMap) {
        functionsInTableMap = /* @__PURE__ */ new WeakMap();
        updateTableMap(0, wasmTable.length);
      }
      return functionsInTableMap.get(func) || 0;
    };
    var freeTableIndexes = [];
    var getEmptyTableSlot = () => {
      if (freeTableIndexes.length) {
        return freeTableIndexes.pop();
      }
      try {
        wasmTable.grow(1);
      } catch (err2) {
        if (!(err2 instanceof RangeError)) {
          throw err2;
        }
        throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
      }
      return wasmTable.length - 1;
    };
    var setWasmTableEntry = (idx, func) => {
      wasmTable.set(idx, func);
      wasmTableMirror[idx] = wasmTable.get(idx);
    };
    var addFunction = (func, sig) => {
      assert(typeof func != "undefined");
      var rtn = getFunctionAddress(func);
      if (rtn) {
        return rtn;
      }
      var ret = getEmptyTableSlot();
      try {
        setWasmTableEntry(ret, func);
      } catch (err2) {
        if (!(err2 instanceof TypeError)) {
          throw err2;
        }
        assert(typeof sig != "undefined", "Missing signature argument to addFunction: " + func);
        var wrapped = convertJsFunctionToWasm(func, sig);
        setWasmTableEntry(ret, wrapped);
      }
      functionsInTableMap.set(func, ret);
      return ret;
    };
    var getCFunc = (ident) => {
      var func = Module["_" + ident];
      assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
      return func;
    };
    var writeArrayToMemory = (array, buffer) => {
      assert(
        array.length >= 0,
        "writeArrayToMemory array must have a length (should be an array or typed array)"
      );
      HEAP8.set(array, buffer);
    };
    var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
    var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
    var ccall = (ident, returnType, argTypes, args, opts) => {
      var toC = {
        string: (str) => {
          var ret2 = 0;
          if (str !== null && str !== void 0 && str !== 0) {
            ret2 = stringToUTF8OnStack(str);
          }
          return ret2;
        },
        array: (arr) => {
          var ret2 = stackAlloc(arr.length);
          writeArrayToMemory(arr, ret2);
          return ret2;
        }
      };
      function convertReturnValue(ret2) {
        if (returnType === "string") {
          return UTF8ToString(ret2);
        }
        if (returnType === "boolean") return Boolean(ret2);
        return ret2;
      }
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      assert(returnType !== "array", 'Return type should not be "array".');
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func(...cArgs);
      function onDone(ret2) {
        if (stack !== 0) stackRestore(stack);
        return convertReturnValue(ret2);
      }
      ret = onDone(ret);
      return ret;
    };
    var cwrap = (ident, returnType, argTypes, opts) => {
      return (...args) => ccall(ident, returnType, argTypes, args);
    };
    var removeFunction = (index) => {
      functionsInTableMap.delete(getWasmTableEntry(index));
      setWasmTableEntry(index, null);
      freeTableIndexes.push(index);
    };
    var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      assert(outPtr % 2 == 0, "Pointer passed to stringToUTF16 must be aligned to two bytes!");
      assert(
        typeof maxBytesToWrite == "number",
        "stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!"
      );
      maxBytesToWrite ?? (maxBytesToWrite = 2147483647);
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
      }
      HEAP16[outPtr >> 1] = 0;
      return outPtr - startPtr;
    };
    FS.createPreloadedFile = FS_createPreloadedFile;
    FS.staticInit();
    function checkIncomingModuleAPI() {
      ignoredModuleProp("fetchSettings");
    }
    var wasmImports = {
      /** @export */
      __assert_fail: ___assert_fail,
      /** @export */
      __syscall_fcntl64: ___syscall_fcntl64,
      /** @export */
      __syscall_fstat64: ___syscall_fstat64,
      /** @export */
      __syscall_ftruncate64: ___syscall_ftruncate64,
      /** @export */
      __syscall_getdents64: ___syscall_getdents64,
      /** @export */
      __syscall_ioctl: ___syscall_ioctl,
      /** @export */
      __syscall_lstat64: ___syscall_lstat64,
      /** @export */
      __syscall_newfstatat: ___syscall_newfstatat,
      /** @export */
      __syscall_openat: ___syscall_openat,
      /** @export */
      __syscall_rmdir: ___syscall_rmdir,
      /** @export */
      __syscall_stat64: ___syscall_stat64,
      /** @export */
      __syscall_unlinkat: ___syscall_unlinkat,
      /** @export */
      _abort_js: __abort_js,
      /** @export */
      _emscripten_memcpy_js: __emscripten_memcpy_js,
      /** @export */
      _emscripten_throw_longjmp: __emscripten_throw_longjmp,
      /** @export */
      _gmtime_js: __gmtime_js,
      /** @export */
      _localtime_js: __localtime_js,
      /** @export */
      _tzset_js: __tzset_js,
      /** @export */
      emscripten_date_now: _emscripten_date_now,
      /** @export */
      emscripten_resize_heap: _emscripten_resize_heap,
      /** @export */
      environ_get: _environ_get,
      /** @export */
      environ_sizes_get: _environ_sizes_get,
      /** @export */
      fd_close: _fd_close,
      /** @export */
      fd_read: _fd_read,
      /** @export */
      fd_seek: _fd_seek,
      /** @export */
      fd_sync: _fd_sync,
      /** @export */
      fd_write: _fd_write,
      /** @export */
      invoke_ii,
      /** @export */
      invoke_iii,
      /** @export */
      invoke_iiii,
      /** @export */
      invoke_iiiii,
      /** @export */
      invoke_v,
      /** @export */
      invoke_vii,
      /** @export */
      invoke_viii,
      /** @export */
      invoke_viiii,
      /** @export */
      invoke_viiiiiiiii
    };
    var wasmExports = createWasm();
    Module["_PDFiumExt_Init"] = createExportWrapper("PDFiumExt_Init", 0);
    Module["_FPDF_InitLibraryWithConfig"] = createExportWrapper(
      "FPDF_InitLibraryWithConfig",
      1
    );
    Module["_PDFiumExt_OpenFileWriter"] = createExportWrapper(
      "PDFiumExt_OpenFileWriter",
      0
    );
    Module["_PDFiumExt_GetFileWriterSize"] = createExportWrapper("PDFiumExt_GetFileWriterSize", 1);
    Module["_PDFiumExt_GetFileWriterData"] = createExportWrapper("PDFiumExt_GetFileWriterData", 3);
    Module["_PDFiumExt_CloseFileWriter"] = createExportWrapper(
      "PDFiumExt_CloseFileWriter",
      1
    );
    Module["_PDFiumExt_SaveAsCopy"] = createExportWrapper(
      "PDFiumExt_SaveAsCopy",
      2
    );
    Module["_FPDF_SaveAsCopy"] = createExportWrapper("FPDF_SaveAsCopy", 3);
    Module["_PDFiumExt_OpenFormFillInfo"] = createExportWrapper(
      "PDFiumExt_OpenFormFillInfo",
      0
    );
    Module["_PDFiumExt_CloseFormFillInfo"] = createExportWrapper("PDFiumExt_CloseFormFillInfo", 1);
    Module["_PDFiumExt_InitFormFillEnvironment"] = createExportWrapper("PDFiumExt_InitFormFillEnvironment", 2);
    Module["_FPDFDOC_InitFormFillEnvironment"] = createExportWrapper("FPDFDOC_InitFormFillEnvironment", 2);
    Module["_PDFiumExt_ExitFormFillEnvironment"] = createExportWrapper("PDFiumExt_ExitFormFillEnvironment", 1);
    Module["_FPDFDOC_ExitFormFillEnvironment"] = createExportWrapper("FPDFDOC_ExitFormFillEnvironment", 1);
    Module["_EPDFNamedDest_SetDest"] = createExportWrapper(
      "EPDFNamedDest_SetDest",
      3
    );
    Module["_EPDFNamedDest_Remove"] = createExportWrapper(
      "EPDFNamedDest_Remove",
      2
    );
    Module["_EPDFDest_CreateView"] = createExportWrapper(
      "EPDFDest_CreateView",
      4
    );
    Module["_EPDFDest_CreateXYZ"] = createExportWrapper(
      "EPDFDest_CreateXYZ",
      7
    );
    Module["_EPDFDest_CreateRemoteView"] = createExportWrapper(
      "EPDFDest_CreateRemoteView",
      5
    );
    Module["_EPDFDest_CreateRemoteXYZ"] = createExportWrapper(
      "EPDFDest_CreateRemoteXYZ",
      8
    );
    Module["_EPDFAction_CreateGoTo"] = createExportWrapper(
      "EPDFAction_CreateGoTo",
      2
    );
    Module["_EPDFAction_CreateGoToNamed"] = createExportWrapper(
      "EPDFAction_CreateGoToNamed",
      2
    );
    Module["_EPDFAction_CreateLaunch"] = createExportWrapper(
      "EPDFAction_CreateLaunch",
      2
    );
    Module["_EPDFAction_CreateRemoteGoToByName"] = createExportWrapper("EPDFAction_CreateRemoteGoToByName", 3);
    Module["_EPDFAction_CreateRemoteGoToDest"] = createExportWrapper("EPDFAction_CreateRemoteGoToDest", 3);
    Module["_EPDFAction_CreateURI"] = createExportWrapper(
      "EPDFAction_CreateURI",
      2
    );
    Module["_EPDFBookmark_Create"] = createExportWrapper(
      "EPDFBookmark_Create",
      2
    );
    Module["_EPDFBookmark_Delete"] = createExportWrapper(
      "EPDFBookmark_Delete",
      2
    );
    Module["_EPDFBookmark_AppendChild"] = createExportWrapper(
      "EPDFBookmark_AppendChild",
      3
    );
    Module["_EPDFBookmark_InsertAfter"] = createExportWrapper(
      "EPDFBookmark_InsertAfter",
      4
    );
    Module["_EPDFBookmark_Clear"] = createExportWrapper(
      "EPDFBookmark_Clear",
      1
    );
    Module["_EPDFBookmark_SetTitle"] = createExportWrapper(
      "EPDFBookmark_SetTitle",
      2
    );
    Module["_EPDFBookmark_SetDest"] = createExportWrapper(
      "EPDFBookmark_SetDest",
      3
    );
    Module["_EPDFBookmark_SetAction"] = createExportWrapper(
      "EPDFBookmark_SetAction",
      3
    );
    Module["_EPDFBookmark_ClearTarget"] = createExportWrapper(
      "EPDFBookmark_ClearTarget",
      1
    );
    Module["_EPDF_PNG_EncodeRGBA"] = createExportWrapper(
      "EPDF_PNG_EncodeRGBA",
      6
    );
    Module["_FPDFAnnot_IsSupportedSubtype"] = createExportWrapper("FPDFAnnot_IsSupportedSubtype", 1);
    Module["_FPDFPage_CreateAnnot"] = createExportWrapper(
      "FPDFPage_CreateAnnot",
      2
    );
    Module["_FPDFPage_GetAnnotCount"] = createExportWrapper(
      "FPDFPage_GetAnnotCount",
      1
    );
    Module["_FPDFPage_GetAnnot"] = createExportWrapper(
      "FPDFPage_GetAnnot",
      2
    );
    Module["_FPDFPage_GetAnnotIndex"] = createExportWrapper(
      "FPDFPage_GetAnnotIndex",
      2
    );
    Module["_FPDFPage_CloseAnnot"] = createExportWrapper(
      "FPDFPage_CloseAnnot",
      1
    );
    Module["_FPDFPage_RemoveAnnot"] = createExportWrapper(
      "FPDFPage_RemoveAnnot",
      2
    );
    Module["_FPDFAnnot_GetSubtype"] = createExportWrapper(
      "FPDFAnnot_GetSubtype",
      1
    );
    Module["_FPDFAnnot_IsObjectSupportedSubtype"] = createExportWrapper("FPDFAnnot_IsObjectSupportedSubtype", 1);
    Module["_FPDFAnnot_UpdateObject"] = createExportWrapper(
      "FPDFAnnot_UpdateObject",
      2
    );
    Module["_FPDFAnnot_AddInkStroke"] = createExportWrapper(
      "FPDFAnnot_AddInkStroke",
      3
    );
    Module["_FPDFAnnot_RemoveInkList"] = createExportWrapper(
      "FPDFAnnot_RemoveInkList",
      1
    );
    Module["_FPDFAnnot_AppendObject"] = createExportWrapper(
      "FPDFAnnot_AppendObject",
      2
    );
    Module["_FPDFAnnot_GetObjectCount"] = createExportWrapper(
      "FPDFAnnot_GetObjectCount",
      1
    );
    Module["_FPDFAnnot_GetObject"] = createExportWrapper(
      "FPDFAnnot_GetObject",
      2
    );
    Module["_FPDFAnnot_RemoveObject"] = createExportWrapper(
      "FPDFAnnot_RemoveObject",
      2
    );
    Module["_FPDFAnnot_SetColor"] = createExportWrapper(
      "FPDFAnnot_SetColor",
      6
    );
    Module["_FPDFAnnot_GetColor"] = createExportWrapper(
      "FPDFAnnot_GetColor",
      6
    );
    Module["_FPDFAnnot_HasAttachmentPoints"] = createExportWrapper("FPDFAnnot_HasAttachmentPoints", 1);
    Module["_FPDFAnnot_SetAttachmentPoints"] = createExportWrapper("FPDFAnnot_SetAttachmentPoints", 3);
    Module["_FPDFAnnot_AppendAttachmentPoints"] = createExportWrapper("FPDFAnnot_AppendAttachmentPoints", 2);
    Module["_FPDFAnnot_CountAttachmentPoints"] = createExportWrapper("FPDFAnnot_CountAttachmentPoints", 1);
    Module["_FPDFAnnot_GetAttachmentPoints"] = createExportWrapper("FPDFAnnot_GetAttachmentPoints", 3);
    Module["_FPDFAnnot_SetRect"] = createExportWrapper(
      "FPDFAnnot_SetRect",
      2
    );
    Module["_FPDFAnnot_GetRect"] = createExportWrapper(
      "FPDFAnnot_GetRect",
      2
    );
    Module["_FPDFAnnot_GetVertices"] = createExportWrapper(
      "FPDFAnnot_GetVertices",
      3
    );
    Module["_FPDFAnnot_GetInkListCount"] = createExportWrapper(
      "FPDFAnnot_GetInkListCount",
      1
    );
    Module["_FPDFAnnot_GetInkListPath"] = createExportWrapper(
      "FPDFAnnot_GetInkListPath",
      4
    );
    Module["_FPDFAnnot_GetLine"] = createExportWrapper(
      "FPDFAnnot_GetLine",
      3
    );
    Module["_FPDFAnnot_SetBorder"] = createExportWrapper(
      "FPDFAnnot_SetBorder",
      4
    );
    Module["_FPDFAnnot_GetBorder"] = createExportWrapper(
      "FPDFAnnot_GetBorder",
      4
    );
    Module["_FPDFAnnot_HasKey"] = createExportWrapper(
      "FPDFAnnot_HasKey",
      2
    );
    Module["_FPDFAnnot_GetValueType"] = createExportWrapper(
      "FPDFAnnot_GetValueType",
      2
    );
    Module["_FPDFAnnot_SetStringValue"] = createExportWrapper(
      "FPDFAnnot_SetStringValue",
      3
    );
    Module["_FPDFAnnot_GetStringValue"] = createExportWrapper(
      "FPDFAnnot_GetStringValue",
      4
    );
    Module["_FPDFAnnot_GetNumberValue"] = createExportWrapper(
      "FPDFAnnot_GetNumberValue",
      3
    );
    Module["_FPDFAnnot_SetAP"] = createExportWrapper("FPDFAnnot_SetAP", 3);
    Module["_FPDFAnnot_GetAP"] = createExportWrapper("FPDFAnnot_GetAP", 4);
    Module["_FPDFAnnot_GetLinkedAnnot"] = createExportWrapper(
      "FPDFAnnot_GetLinkedAnnot",
      2
    );
    Module["_FPDFAnnot_GetFlags"] = createExportWrapper(
      "FPDFAnnot_GetFlags",
      1
    );
    Module["_FPDFAnnot_SetFlags"] = createExportWrapper(
      "FPDFAnnot_SetFlags",
      2
    );
    Module["_FPDFAnnot_GetFormFieldFlags"] = createExportWrapper("FPDFAnnot_GetFormFieldFlags", 2);
    Module["_FPDFAnnot_SetFormFieldFlags"] = createExportWrapper("FPDFAnnot_SetFormFieldFlags", 3);
    Module["_FPDFAnnot_GetFormFieldAtPoint"] = createExportWrapper("FPDFAnnot_GetFormFieldAtPoint", 3);
    Module["_FPDFAnnot_GetFormFieldName"] = createExportWrapper(
      "FPDFAnnot_GetFormFieldName",
      4
    );
    Module["_FPDFAnnot_GetFormFieldType"] = createExportWrapper(
      "FPDFAnnot_GetFormFieldType",
      2
    );
    Module["_FPDFAnnot_GetFormAdditionalActionJavaScript"] = createExportWrapper("FPDFAnnot_GetFormAdditionalActionJavaScript", 5);
    Module["_FPDFAnnot_GetFormFieldAlternateName"] = createExportWrapper("FPDFAnnot_GetFormFieldAlternateName", 4);
    Module["_FPDFAnnot_GetFormFieldValue"] = createExportWrapper("FPDFAnnot_GetFormFieldValue", 4);
    Module["_FPDFAnnot_GetOptionCount"] = createExportWrapper(
      "FPDFAnnot_GetOptionCount",
      2
    );
    Module["_FPDFAnnot_GetOptionLabel"] = createExportWrapper(
      "FPDFAnnot_GetOptionLabel",
      5
    );
    Module["_FPDFAnnot_IsOptionSelected"] = createExportWrapper(
      "FPDFAnnot_IsOptionSelected",
      3
    );
    Module["_FPDFAnnot_GetFontSize"] = createExportWrapper(
      "FPDFAnnot_GetFontSize",
      3
    );
    Module["_FPDFAnnot_SetFontColor"] = createExportWrapper(
      "FPDFAnnot_SetFontColor",
      5
    );
    Module["_FPDFAnnot_GetFontColor"] = createExportWrapper(
      "FPDFAnnot_GetFontColor",
      5
    );
    Module["_FPDFAnnot_IsChecked"] = createExportWrapper(
      "FPDFAnnot_IsChecked",
      2
    );
    Module["_FPDFAnnot_SetFocusableSubtypes"] = createExportWrapper("FPDFAnnot_SetFocusableSubtypes", 3);
    Module["_FPDFAnnot_GetFocusableSubtypesCount"] = createExportWrapper("FPDFAnnot_GetFocusableSubtypesCount", 1);
    Module["_FPDFAnnot_GetFocusableSubtypes"] = createExportWrapper("FPDFAnnot_GetFocusableSubtypes", 3);
    Module["_FPDFAnnot_GetLink"] = createExportWrapper(
      "FPDFAnnot_GetLink",
      1
    );
    Module["_FPDFAnnot_GetFormControlCount"] = createExportWrapper("FPDFAnnot_GetFormControlCount", 2);
    Module["_FPDFAnnot_GetFormControlIndex"] = createExportWrapper("FPDFAnnot_GetFormControlIndex", 2);
    Module["_FPDFAnnot_GetFormFieldExportValue"] = createExportWrapper("FPDFAnnot_GetFormFieldExportValue", 4);
    Module["_FPDFAnnot_SetURI"] = createExportWrapper(
      "FPDFAnnot_SetURI",
      2
    );
    Module["_FPDFAnnot_GetFileAttachment"] = createExportWrapper("FPDFAnnot_GetFileAttachment", 1);
    Module["_FPDFAnnot_AddFileAttachment"] = createExportWrapper("FPDFAnnot_AddFileAttachment", 2);
    Module["_EPDFAnnot_SetColor"] = createExportWrapper(
      "EPDFAnnot_SetColor",
      5
    );
    Module["_EPDFAnnot_GetColor"] = createExportWrapper(
      "EPDFAnnot_GetColor",
      5
    );
    Module["_EPDFAnnot_ClearColor"] = createExportWrapper(
      "EPDFAnnot_ClearColor",
      2
    );
    Module["_EPDFAnnot_SetOpacity"] = createExportWrapper(
      "EPDFAnnot_SetOpacity",
      2
    );
    Module["_EPDFAnnot_GetOpacity"] = createExportWrapper(
      "EPDFAnnot_GetOpacity",
      2
    );
    Module["_EPDFAnnot_GetBorderEffect"] = createExportWrapper(
      "EPDFAnnot_GetBorderEffect",
      2
    );
    Module["_EPDFAnnot_GetRectangleDifferences"] = createExportWrapper("EPDFAnnot_GetRectangleDifferences", 5);
    Module["_EPDFAnnot_GetBorderDashPatternCount"] = createExportWrapper("EPDFAnnot_GetBorderDashPatternCount", 1);
    Module["_EPDFAnnot_GetBorderDashPattern"] = createExportWrapper("EPDFAnnot_GetBorderDashPattern", 3);
    Module["_EPDFAnnot_SetBorderDashPattern"] = createExportWrapper("EPDFAnnot_SetBorderDashPattern", 3);
    Module["_EPDFAnnot_GetBorderStyle"] = createExportWrapper(
      "EPDFAnnot_GetBorderStyle",
      2
    );
    Module["_EPDFAnnot_SetBorderStyle"] = createExportWrapper(
      "EPDFAnnot_SetBorderStyle",
      3
    );
    Module["_EPDFAnnot_GenerateAppearance"] = createExportWrapper("EPDFAnnot_GenerateAppearance", 1);
    Module["_EPDFAnnot_GenerateAppearanceWithBlend"] = createExportWrapper("EPDFAnnot_GenerateAppearanceWithBlend", 2);
    Module["_EPDFAnnot_GetBlendMode"] = createExportWrapper(
      "EPDFAnnot_GetBlendMode",
      1
    );
    Module["_EPDFAnnot_SetIntent"] = createExportWrapper(
      "EPDFAnnot_SetIntent",
      2
    );
    Module["_EPDFAnnot_GetIntent"] = createExportWrapper(
      "EPDFAnnot_GetIntent",
      3
    );
    Module["_EPDFAnnot_GetRichContent"] = createExportWrapper(
      "EPDFAnnot_GetRichContent",
      3
    );
    Module["_EPDFAnnot_SetLineEndings"] = createExportWrapper(
      "EPDFAnnot_SetLineEndings",
      3
    );
    Module["_EPDFAnnot_GetLineEndings"] = createExportWrapper(
      "EPDFAnnot_GetLineEndings",
      3
    );
    Module["_EPDFAnnot_SetVertices"] = createExportWrapper(
      "EPDFAnnot_SetVertices",
      3
    );
    Module["_EPDFAnnot_SetLine"] = createExportWrapper(
      "EPDFAnnot_SetLine",
      3
    );
    Module["_EPDFAnnot_SetDefaultAppearance"] = createExportWrapper("EPDFAnnot_SetDefaultAppearance", 6);
    Module["_EPDFAnnot_GetDefaultAppearance"] = createExportWrapper("EPDFAnnot_GetDefaultAppearance", 6);
    Module["_EPDFAnnot_SetTextAlignment"] = createExportWrapper(
      "EPDFAnnot_SetTextAlignment",
      2
    );
    Module["_EPDFAnnot_GetTextAlignment"] = createExportWrapper(
      "EPDFAnnot_GetTextAlignment",
      1
    );
    Module["_EPDFAnnot_SetVerticalAlignment"] = createExportWrapper("EPDFAnnot_SetVerticalAlignment", 2);
    Module["_EPDFAnnot_GetVerticalAlignment"] = createExportWrapper("EPDFAnnot_GetVerticalAlignment", 1);
    Module["_EPDFPage_GetAnnotByName"] = createExportWrapper(
      "EPDFPage_GetAnnotByName",
      2
    );
    Module["_EPDFPage_RemoveAnnotByName"] = createExportWrapper(
      "EPDFPage_RemoveAnnotByName",
      2
    );
    Module["_EPDFAnnot_SetLinkedAnnot"] = createExportWrapper(
      "EPDFAnnot_SetLinkedAnnot",
      3
    );
    Module["_EPDFPage_GetAnnotCountRaw"] = createExportWrapper(
      "EPDFPage_GetAnnotCountRaw",
      2
    );
    Module["_EPDFPage_GetAnnotRaw"] = createExportWrapper(
      "EPDFPage_GetAnnotRaw",
      3
    );
    Module["_EPDFPage_RemoveAnnotRaw"] = createExportWrapper(
      "EPDFPage_RemoveAnnotRaw",
      3
    );
    Module["_EPDFAnnot_SetIcon"] = createExportWrapper(
      "EPDFAnnot_SetIcon",
      2
    );
    Module["_EPDFAnnot_GetIcon"] = createExportWrapper(
      "EPDFAnnot_GetIcon",
      1
    );
    Module["_EPDFAnnot_UpdateAppearanceToRect"] = createExportWrapper("EPDFAnnot_UpdateAppearanceToRect", 2);
    Module["_EPDFPage_CreateAnnot"] = createExportWrapper(
      "EPDFPage_CreateAnnot",
      2
    );
    Module["_FPDFDoc_GetAttachmentCount"] = createExportWrapper(
      "FPDFDoc_GetAttachmentCount",
      1
    );
    Module["_FPDFDoc_AddAttachment"] = createExportWrapper(
      "FPDFDoc_AddAttachment",
      2
    );
    Module["_FPDFDoc_GetAttachment"] = createExportWrapper(
      "FPDFDoc_GetAttachment",
      2
    );
    Module["_FPDFDoc_DeleteAttachment"] = createExportWrapper(
      "FPDFDoc_DeleteAttachment",
      2
    );
    Module["_FPDFAttachment_GetName"] = createExportWrapper(
      "FPDFAttachment_GetName",
      3
    );
    Module["_FPDFAttachment_HasKey"] = createExportWrapper(
      "FPDFAttachment_HasKey",
      2
    );
    Module["_FPDFAttachment_GetValueType"] = createExportWrapper("FPDFAttachment_GetValueType", 2);
    Module["_FPDFAttachment_SetStringValue"] = createExportWrapper("FPDFAttachment_SetStringValue", 3);
    Module["_FPDFAttachment_GetStringValue"] = createExportWrapper("FPDFAttachment_GetStringValue", 4);
    Module["_FPDFAttachment_SetFile"] = createExportWrapper(
      "FPDFAttachment_SetFile",
      4
    );
    Module["_FPDFAttachment_GetFile"] = createExportWrapper(
      "FPDFAttachment_GetFile",
      4
    );
    Module["_FPDFAttachment_GetSubtype"] = createExportWrapper(
      "FPDFAttachment_GetSubtype",
      3
    );
    Module["_EPDFAttachment_SetSubtype"] = createExportWrapper(
      "EPDFAttachment_SetSubtype",
      2
    );
    Module["_EPDFAttachment_SetDescription"] = createExportWrapper("EPDFAttachment_SetDescription", 2);
    Module["_EPDFAttachment_GetDescription"] = createExportWrapper("EPDFAttachment_GetDescription", 3);
    Module["_EPDFAttachment_GetIntegerValue"] = createExportWrapper("EPDFAttachment_GetIntegerValue", 3);
    Module["_FPDFCatalog_IsTagged"] = createExportWrapper(
      "FPDFCatalog_IsTagged",
      1
    );
    Module["_FPDFCatalog_SetLanguage"] = createExportWrapper(
      "FPDFCatalog_SetLanguage",
      2
    );
    Module["_EPDFCatalog_GetLanguage"] = createExportWrapper(
      "EPDFCatalog_GetLanguage",
      3
    );
    Module["_FPDFAvail_Create"] = createExportWrapper(
      "FPDFAvail_Create",
      2
    );
    Module["_FPDFAvail_Destroy"] = createExportWrapper(
      "FPDFAvail_Destroy",
      1
    );
    Module["_FPDFAvail_IsDocAvail"] = createExportWrapper(
      "FPDFAvail_IsDocAvail",
      2
    );
    Module["_FPDFAvail_GetDocument"] = createExportWrapper(
      "FPDFAvail_GetDocument",
      2
    );
    Module["_FPDFAvail_GetFirstPageNum"] = createExportWrapper(
      "FPDFAvail_GetFirstPageNum",
      1
    );
    Module["_FPDFAvail_IsPageAvail"] = createExportWrapper(
      "FPDFAvail_IsPageAvail",
      3
    );
    Module["_FPDFAvail_IsFormAvail"] = createExportWrapper(
      "FPDFAvail_IsFormAvail",
      2
    );
    Module["_FPDFAvail_IsLinearized"] = createExportWrapper(
      "FPDFAvail_IsLinearized",
      1
    );
    Module["_FPDFBookmark_GetFirstChild"] = createExportWrapper(
      "FPDFBookmark_GetFirstChild",
      2
    );
    Module["_FPDFBookmark_GetNextSibling"] = createExportWrapper("FPDFBookmark_GetNextSibling", 2);
    Module["_FPDFBookmark_GetTitle"] = createExportWrapper(
      "FPDFBookmark_GetTitle",
      3
    );
    Module["_FPDFBookmark_GetCount"] = createExportWrapper(
      "FPDFBookmark_GetCount",
      1
    );
    Module["_FPDFBookmark_Find"] = createExportWrapper(
      "FPDFBookmark_Find",
      2
    );
    Module["_FPDFBookmark_GetDest"] = createExportWrapper(
      "FPDFBookmark_GetDest",
      2
    );
    Module["_FPDFBookmark_GetAction"] = createExportWrapper(
      "FPDFBookmark_GetAction",
      1
    );
    Module["_FPDFAction_GetType"] = createExportWrapper(
      "FPDFAction_GetType",
      1
    );
    Module["_FPDFAction_GetDest"] = createExportWrapper(
      "FPDFAction_GetDest",
      2
    );
    Module["_FPDFAction_GetFilePath"] = createExportWrapper(
      "FPDFAction_GetFilePath",
      3
    );
    Module["_FPDFAction_GetURIPath"] = createExportWrapper(
      "FPDFAction_GetURIPath",
      4
    );
    Module["_FPDFDest_GetDestPageIndex"] = createExportWrapper(
      "FPDFDest_GetDestPageIndex",
      2
    );
    Module["_FPDFDest_GetView"] = createExportWrapper(
      "FPDFDest_GetView",
      3
    );
    Module["_FPDFDest_GetLocationInPage"] = createExportWrapper(
      "FPDFDest_GetLocationInPage",
      7
    );
    Module["_FPDFLink_GetLinkAtPoint"] = createExportWrapper(
      "FPDFLink_GetLinkAtPoint",
      3
    );
    Module["_FPDFLink_GetLinkZOrderAtPoint"] = createExportWrapper("FPDFLink_GetLinkZOrderAtPoint", 3);
    Module["_FPDFLink_GetDest"] = createExportWrapper(
      "FPDFLink_GetDest",
      2
    );
    Module["_FPDFLink_GetAction"] = createExportWrapper(
      "FPDFLink_GetAction",
      1
    );
    Module["_FPDFLink_Enumerate"] = createExportWrapper(
      "FPDFLink_Enumerate",
      3
    );
    Module["_FPDFLink_GetAnnot"] = createExportWrapper(
      "FPDFLink_GetAnnot",
      2
    );
    Module["_FPDFLink_GetAnnotRect"] = createExportWrapper(
      "FPDFLink_GetAnnotRect",
      2
    );
    Module["_FPDFLink_CountQuadPoints"] = createExportWrapper(
      "FPDFLink_CountQuadPoints",
      1
    );
    Module["_FPDFLink_GetQuadPoints"] = createExportWrapper(
      "FPDFLink_GetQuadPoints",
      3
    );
    Module["_FPDF_GetPageAAction"] = createExportWrapper(
      "FPDF_GetPageAAction",
      2
    );
    Module["_FPDF_GetFileIdentifier"] = createExportWrapper(
      "FPDF_GetFileIdentifier",
      4
    );
    Module["_FPDF_GetMetaText"] = createExportWrapper(
      "FPDF_GetMetaText",
      4
    );
    Module["_FPDF_GetPageLabel"] = createExportWrapper(
      "FPDF_GetPageLabel",
      4
    );
    Module["_EPDF_SetMetaText"] = createExportWrapper(
      "EPDF_SetMetaText",
      3
    );
    Module["_EPDF_HasMetaText"] = createExportWrapper(
      "EPDF_HasMetaText",
      2
    );
    Module["_EPDF_GetMetaTrapped"] = createExportWrapper(
      "EPDF_GetMetaTrapped",
      1
    );
    Module["_EPDF_SetMetaTrapped"] = createExportWrapper(
      "EPDF_SetMetaTrapped",
      2
    );
    Module["_EPDF_GetMetaKeyCount"] = createExportWrapper(
      "EPDF_GetMetaKeyCount",
      2
    );
    Module["_EPDF_GetMetaKeyName"] = createExportWrapper(
      "EPDF_GetMetaKeyName",
      5
    );
    Module["_FPDFPageObj_NewImageObj"] = createExportWrapper(
      "FPDFPageObj_NewImageObj",
      1
    );
    Module["_FPDFImageObj_LoadJpegFile"] = createExportWrapper(
      "FPDFImageObj_LoadJpegFile",
      4
    );
    Module["_FPDFImageObj_LoadJpegFileInline"] = createExportWrapper("FPDFImageObj_LoadJpegFileInline", 4);
    Module["_FPDFImageObj_SetMatrix"] = createExportWrapper(
      "FPDFImageObj_SetMatrix",
      7
    );
    Module["_FPDFImageObj_SetBitmap"] = createExportWrapper(
      "FPDFImageObj_SetBitmap",
      4
    );
    Module["_FPDFImageObj_GetBitmap"] = createExportWrapper(
      "FPDFImageObj_GetBitmap",
      1
    );
    Module["_FPDFImageObj_GetRenderedBitmap"] = createExportWrapper("FPDFImageObj_GetRenderedBitmap", 3);
    Module["_FPDFImageObj_GetImageDataDecoded"] = createExportWrapper("FPDFImageObj_GetImageDataDecoded", 3);
    Module["_FPDFImageObj_GetImageDataRaw"] = createExportWrapper("FPDFImageObj_GetImageDataRaw", 3);
    Module["_FPDFImageObj_GetImageFilterCount"] = createExportWrapper("FPDFImageObj_GetImageFilterCount", 1);
    Module["_FPDFImageObj_GetImageFilter"] = createExportWrapper("FPDFImageObj_GetImageFilter", 4);
    Module["_FPDFImageObj_GetImageMetadata"] = createExportWrapper("FPDFImageObj_GetImageMetadata", 3);
    Module["_FPDFImageObj_GetImagePixelSize"] = createExportWrapper("FPDFImageObj_GetImagePixelSize", 3);
    Module["_FPDFImageObj_GetIccProfileDataDecoded"] = createExportWrapper("FPDFImageObj_GetIccProfileDataDecoded", 5);
    Module["_FPDF_CreateNewDocument"] = createExportWrapper(
      "FPDF_CreateNewDocument",
      0
    );
    Module["_FPDFPage_Delete"] = createExportWrapper("FPDFPage_Delete", 2);
    Module["_FPDF_MovePages"] = createExportWrapper("FPDF_MovePages", 4);
    Module["_FPDFPage_New"] = createExportWrapper("FPDFPage_New", 4);
    Module["_FPDFPage_GetRotation"] = createExportWrapper(
      "FPDFPage_GetRotation",
      1
    );
    Module["_FPDFPage_InsertObject"] = createExportWrapper(
      "FPDFPage_InsertObject",
      2
    );
    Module["_FPDFPage_InsertObjectAtIndex"] = createExportWrapper("FPDFPage_InsertObjectAtIndex", 3);
    Module["_FPDFPage_RemoveObject"] = createExportWrapper(
      "FPDFPage_RemoveObject",
      2
    );
    Module["_FPDFPage_CountObjects"] = createExportWrapper(
      "FPDFPage_CountObjects",
      1
    );
    Module["_FPDFPage_GetObject"] = createExportWrapper(
      "FPDFPage_GetObject",
      2
    );
    Module["_FPDFPage_HasTransparency"] = createExportWrapper(
      "FPDFPage_HasTransparency",
      1
    );
    Module["_FPDFPageObj_Destroy"] = createExportWrapper(
      "FPDFPageObj_Destroy",
      1
    );
    Module["_FPDFPageObj_GetMarkedContentID"] = createExportWrapper("FPDFPageObj_GetMarkedContentID", 1);
    Module["_FPDFPageObj_CountMarks"] = createExportWrapper(
      "FPDFPageObj_CountMarks",
      1
    );
    Module["_FPDFPageObj_GetMark"] = createExportWrapper(
      "FPDFPageObj_GetMark",
      2
    );
    Module["_FPDFPageObj_AddMark"] = createExportWrapper(
      "FPDFPageObj_AddMark",
      2
    );
    Module["_FPDFPageObj_RemoveMark"] = createExportWrapper(
      "FPDFPageObj_RemoveMark",
      2
    );
    Module["_FPDFPageObjMark_GetName"] = createExportWrapper(
      "FPDFPageObjMark_GetName",
      4
    );
    Module["_FPDFPageObjMark_CountParams"] = createExportWrapper("FPDFPageObjMark_CountParams", 1);
    Module["_FPDFPageObjMark_GetParamKey"] = createExportWrapper("FPDFPageObjMark_GetParamKey", 5);
    Module["_FPDFPageObjMark_GetParamValueType"] = createExportWrapper("FPDFPageObjMark_GetParamValueType", 2);
    Module["_FPDFPageObjMark_GetParamIntValue"] = createExportWrapper("FPDFPageObjMark_GetParamIntValue", 3);
    Module["_FPDFPageObjMark_GetParamStringValue"] = createExportWrapper("FPDFPageObjMark_GetParamStringValue", 5);
    Module["_FPDFPageObjMark_GetParamBlobValue"] = createExportWrapper("FPDFPageObjMark_GetParamBlobValue", 5);
    Module["_FPDFPageObj_HasTransparency"] = createExportWrapper("FPDFPageObj_HasTransparency", 1);
    Module["_FPDFPageObjMark_SetIntParam"] = createExportWrapper("FPDFPageObjMark_SetIntParam", 5);
    Module["_FPDFPageObjMark_SetStringParam"] = createExportWrapper("FPDFPageObjMark_SetStringParam", 5);
    Module["_FPDFPageObjMark_SetBlobParam"] = createExportWrapper("FPDFPageObjMark_SetBlobParam", 6);
    Module["_FPDFPageObjMark_RemoveParam"] = createExportWrapper("FPDFPageObjMark_RemoveParam", 3);
    Module["_FPDFPageObj_GetType"] = createExportWrapper(
      "FPDFPageObj_GetType",
      1
    );
    Module["_FPDFPageObj_GetIsActive"] = createExportWrapper(
      "FPDFPageObj_GetIsActive",
      2
    );
    Module["_FPDFPageObj_SetIsActive"] = createExportWrapper(
      "FPDFPageObj_SetIsActive",
      2
    );
    Module["_FPDFPage_GenerateContent"] = createExportWrapper(
      "FPDFPage_GenerateContent",
      1
    );
    Module["_FPDFPageObj_Transform"] = createExportWrapper(
      "FPDFPageObj_Transform",
      7
    );
    Module["_FPDFPageObj_TransformF"] = createExportWrapper(
      "FPDFPageObj_TransformF",
      2
    );
    Module["_FPDFPageObj_GetMatrix"] = createExportWrapper(
      "FPDFPageObj_GetMatrix",
      2
    );
    Module["_FPDFPageObj_SetMatrix"] = createExportWrapper(
      "FPDFPageObj_SetMatrix",
      2
    );
    Module["_FPDFPageObj_SetBlendMode"] = createExportWrapper(
      "FPDFPageObj_SetBlendMode",
      2
    );
    Module["_FPDFPage_TransformAnnots"] = createExportWrapper(
      "FPDFPage_TransformAnnots",
      7
    );
    Module["_FPDFPage_SetRotation"] = createExportWrapper(
      "FPDFPage_SetRotation",
      2
    );
    Module["_FPDFPageObj_SetFillColor"] = createExportWrapper(
      "FPDFPageObj_SetFillColor",
      5
    );
    Module["_FPDFPageObj_GetFillColor"] = createExportWrapper(
      "FPDFPageObj_GetFillColor",
      5
    );
    Module["_FPDFPageObj_GetBounds"] = createExportWrapper(
      "FPDFPageObj_GetBounds",
      5
    );
    Module["_FPDFPageObj_GetRotatedBounds"] = createExportWrapper("FPDFPageObj_GetRotatedBounds", 2);
    Module["_FPDFPageObj_SetStrokeColor"] = createExportWrapper(
      "FPDFPageObj_SetStrokeColor",
      5
    );
    Module["_FPDFPageObj_GetStrokeColor"] = createExportWrapper(
      "FPDFPageObj_GetStrokeColor",
      5
    );
    Module["_FPDFPageObj_SetStrokeWidth"] = createExportWrapper(
      "FPDFPageObj_SetStrokeWidth",
      2
    );
    Module["_FPDFPageObj_GetStrokeWidth"] = createExportWrapper(
      "FPDFPageObj_GetStrokeWidth",
      2
    );
    Module["_FPDFPageObj_GetLineJoin"] = createExportWrapper(
      "FPDFPageObj_GetLineJoin",
      1
    );
    Module["_FPDFPageObj_SetLineJoin"] = createExportWrapper(
      "FPDFPageObj_SetLineJoin",
      2
    );
    Module["_FPDFPageObj_GetLineCap"] = createExportWrapper(
      "FPDFPageObj_GetLineCap",
      1
    );
    Module["_FPDFPageObj_SetLineCap"] = createExportWrapper(
      "FPDFPageObj_SetLineCap",
      2
    );
    Module["_FPDFPageObj_GetDashPhase"] = createExportWrapper(
      "FPDFPageObj_GetDashPhase",
      2
    );
    Module["_FPDFPageObj_SetDashPhase"] = createExportWrapper(
      "FPDFPageObj_SetDashPhase",
      2
    );
    Module["_FPDFPageObj_GetDashCount"] = createExportWrapper(
      "FPDFPageObj_GetDashCount",
      1
    );
    Module["_FPDFPageObj_GetDashArray"] = createExportWrapper(
      "FPDFPageObj_GetDashArray",
      3
    );
    Module["_FPDFPageObj_SetDashArray"] = createExportWrapper(
      "FPDFPageObj_SetDashArray",
      4
    );
    Module["_FPDFFormObj_CountObjects"] = createExportWrapper(
      "FPDFFormObj_CountObjects",
      1
    );
    Module["_FPDFFormObj_GetObject"] = createExportWrapper(
      "FPDFFormObj_GetObject",
      2
    );
    Module["_FPDFFormObj_RemoveObject"] = createExportWrapper(
      "FPDFFormObj_RemoveObject",
      2
    );
    Module["_FPDFPageObj_CreateNewPath"] = createExportWrapper(
      "FPDFPageObj_CreateNewPath",
      2
    );
    Module["_FPDFPageObj_CreateNewRect"] = createExportWrapper(
      "FPDFPageObj_CreateNewRect",
      4
    );
    Module["_FPDFPath_CountSegments"] = createExportWrapper(
      "FPDFPath_CountSegments",
      1
    );
    Module["_FPDFPath_GetPathSegment"] = createExportWrapper(
      "FPDFPath_GetPathSegment",
      2
    );
    Module["_FPDFPath_MoveTo"] = createExportWrapper("FPDFPath_MoveTo", 3);
    Module["_FPDFPath_LineTo"] = createExportWrapper("FPDFPath_LineTo", 3);
    Module["_FPDFPath_BezierTo"] = createExportWrapper(
      "FPDFPath_BezierTo",
      7
    );
    Module["_FPDFPath_Close"] = createExportWrapper("FPDFPath_Close", 1);
    Module["_FPDFPath_SetDrawMode"] = createExportWrapper(
      "FPDFPath_SetDrawMode",
      3
    );
    Module["_FPDFPath_GetDrawMode"] = createExportWrapper(
      "FPDFPath_GetDrawMode",
      3
    );
    Module["_FPDFPathSegment_GetPoint"] = createExportWrapper(
      "FPDFPathSegment_GetPoint",
      3
    );
    Module["_FPDFPathSegment_GetType"] = createExportWrapper(
      "FPDFPathSegment_GetType",
      1
    );
    Module["_FPDFPathSegment_GetClose"] = createExportWrapper(
      "FPDFPathSegment_GetClose",
      1
    );
    Module["_FPDFPageObj_NewTextObj"] = createExportWrapper(
      "FPDFPageObj_NewTextObj",
      3
    );
    Module["_FPDFText_SetText"] = createExportWrapper(
      "FPDFText_SetText",
      2
    );
    Module["_FPDFText_SetCharcodes"] = createExportWrapper(
      "FPDFText_SetCharcodes",
      3
    );
    Module["_FPDFText_LoadFont"] = createExportWrapper(
      "FPDFText_LoadFont",
      5
    );
    Module["_FPDFText_LoadStandardFont"] = createExportWrapper(
      "FPDFText_LoadStandardFont",
      2
    );
    Module["_FPDFText_LoadCidType2Font"] = createExportWrapper(
      "FPDFText_LoadCidType2Font",
      6
    );
    Module["_FPDFTextObj_GetFontSize"] = createExportWrapper(
      "FPDFTextObj_GetFontSize",
      2
    );
    Module["_FPDFTextObj_GetText"] = createExportWrapper(
      "FPDFTextObj_GetText",
      4
    );
    Module["_FPDFTextObj_GetRenderedBitmap"] = createExportWrapper("FPDFTextObj_GetRenderedBitmap", 4);
    Module["_FPDFFont_Close"] = createExportWrapper("FPDFFont_Close", 1);
    Module["_FPDFPageObj_CreateTextObj"] = createExportWrapper(
      "FPDFPageObj_CreateTextObj",
      3
    );
    Module["_FPDFTextObj_GetTextRenderMode"] = createExportWrapper("FPDFTextObj_GetTextRenderMode", 1);
    Module["_FPDFTextObj_SetTextRenderMode"] = createExportWrapper("FPDFTextObj_SetTextRenderMode", 2);
    Module["_FPDFTextObj_GetFont"] = createExportWrapper(
      "FPDFTextObj_GetFont",
      1
    );
    Module["_FPDFFont_GetBaseFontName"] = createExportWrapper(
      "FPDFFont_GetBaseFontName",
      3
    );
    Module["_FPDFFont_GetFamilyName"] = createExportWrapper(
      "FPDFFont_GetFamilyName",
      3
    );
    Module["_FPDFFont_GetFontData"] = createExportWrapper(
      "FPDFFont_GetFontData",
      4
    );
    Module["_FPDFFont_GetIsEmbedded"] = createExportWrapper(
      "FPDFFont_GetIsEmbedded",
      1
    );
    Module["_FPDFFont_GetFlags"] = createExportWrapper(
      "FPDFFont_GetFlags",
      1
    );
    Module["_FPDFFont_GetWeight"] = createExportWrapper(
      "FPDFFont_GetWeight",
      1
    );
    Module["_FPDFFont_GetItalicAngle"] = createExportWrapper(
      "FPDFFont_GetItalicAngle",
      2
    );
    Module["_FPDFFont_GetAscent"] = createExportWrapper(
      "FPDFFont_GetAscent",
      3
    );
    Module["_FPDFFont_GetDescent"] = createExportWrapper(
      "FPDFFont_GetDescent",
      3
    );
    Module["_FPDFFont_GetGlyphWidth"] = createExportWrapper(
      "FPDFFont_GetGlyphWidth",
      4
    );
    Module["_FPDFFont_GetGlyphPath"] = createExportWrapper(
      "FPDFFont_GetGlyphPath",
      3
    );
    Module["_FPDFGlyphPath_CountGlyphSegments"] = createExportWrapper("FPDFGlyphPath_CountGlyphSegments", 1);
    Module["_FPDFGlyphPath_GetGlyphPathSegment"] = createExportWrapper("FPDFGlyphPath_GetGlyphPathSegment", 2);
    Module["_EPDFText_RedactInRect"] = createExportWrapper(
      "EPDFText_RedactInRect",
      4
    );
    Module["_EPDFText_RedactInQuads"] = createExportWrapper(
      "EPDFText_RedactInQuads",
      5
    );
    Module["_FPDFDoc_GetPageMode"] = createExportWrapper(
      "FPDFDoc_GetPageMode",
      1
    );
    Module["_FPDFPage_Flatten"] = createExportWrapper(
      "FPDFPage_Flatten",
      2
    );
    Module["_FPDFPage_HasFormFieldAtPoint"] = createExportWrapper("FPDFPage_HasFormFieldAtPoint", 4);
    Module["_FPDFPage_FormFieldZOrderAtPoint"] = createExportWrapper("FPDFPage_FormFieldZOrderAtPoint", 4);
    Module["_malloc"] = createExportWrapper("malloc", 1);
    Module["_free"] = createExportWrapper("free", 1);
    Module["_FORM_OnMouseMove"] = createExportWrapper(
      "FORM_OnMouseMove",
      5
    );
    Module["_FORM_OnMouseWheel"] = createExportWrapper(
      "FORM_OnMouseWheel",
      6
    );
    Module["_FORM_OnFocus"] = createExportWrapper("FORM_OnFocus", 5);
    Module["_FORM_OnLButtonDown"] = createExportWrapper(
      "FORM_OnLButtonDown",
      5
    );
    Module["_FORM_OnLButtonUp"] = createExportWrapper(
      "FORM_OnLButtonUp",
      5
    );
    Module["_FORM_OnLButtonDoubleClick"] = createExportWrapper(
      "FORM_OnLButtonDoubleClick",
      5
    );
    Module["_FORM_OnRButtonDown"] = createExportWrapper(
      "FORM_OnRButtonDown",
      5
    );
    Module["_FORM_OnRButtonUp"] = createExportWrapper(
      "FORM_OnRButtonUp",
      5
    );
    Module["_FORM_OnKeyDown"] = createExportWrapper("FORM_OnKeyDown", 4);
    Module["_FORM_OnKeyUp"] = createExportWrapper("FORM_OnKeyUp", 4);
    Module["_FORM_OnChar"] = createExportWrapper("FORM_OnChar", 4);
    Module["_FORM_GetFocusedText"] = createExportWrapper(
      "FORM_GetFocusedText",
      4
    );
    Module["_FORM_GetSelectedText"] = createExportWrapper(
      "FORM_GetSelectedText",
      4
    );
    Module["_FORM_ReplaceAndKeepSelection"] = createExportWrapper("FORM_ReplaceAndKeepSelection", 3);
    Module["_FORM_ReplaceSelection"] = createExportWrapper(
      "FORM_ReplaceSelection",
      3
    );
    Module["_FORM_SelectAllText"] = createExportWrapper(
      "FORM_SelectAllText",
      2
    );
    Module["_FORM_CanUndo"] = createExportWrapper("FORM_CanUndo", 2);
    Module["_FORM_CanRedo"] = createExportWrapper("FORM_CanRedo", 2);
    Module["_FORM_Undo"] = createExportWrapper("FORM_Undo", 2);
    Module["_FORM_Redo"] = createExportWrapper("FORM_Redo", 2);
    Module["_FORM_ForceToKillFocus"] = createExportWrapper(
      "FORM_ForceToKillFocus",
      1
    );
    Module["_FORM_GetFocusedAnnot"] = createExportWrapper(
      "FORM_GetFocusedAnnot",
      3
    );
    Module["_FORM_SetFocusedAnnot"] = createExportWrapper(
      "FORM_SetFocusedAnnot",
      2
    );
    Module["_FPDF_FFLDraw"] = createExportWrapper("FPDF_FFLDraw", 9);
    Module["_FPDF_SetFormFieldHighlightColor"] = createExportWrapper("FPDF_SetFormFieldHighlightColor", 3);
    Module["_FPDF_SetFormFieldHighlightAlpha"] = createExportWrapper("FPDF_SetFormFieldHighlightAlpha", 2);
    Module["_FPDF_RemoveFormFieldHighlight"] = createExportWrapper("FPDF_RemoveFormFieldHighlight", 1);
    Module["_FORM_OnAfterLoadPage"] = createExportWrapper(
      "FORM_OnAfterLoadPage",
      2
    );
    Module["_FORM_OnBeforeClosePage"] = createExportWrapper(
      "FORM_OnBeforeClosePage",
      2
    );
    Module["_FORM_DoDocumentJSAction"] = createExportWrapper(
      "FORM_DoDocumentJSAction",
      1
    );
    Module["_FORM_DoDocumentOpenAction"] = createExportWrapper(
      "FORM_DoDocumentOpenAction",
      1
    );
    Module["_FORM_DoDocumentAAction"] = createExportWrapper(
      "FORM_DoDocumentAAction",
      2
    );
    Module["_FORM_DoPageAAction"] = createExportWrapper(
      "FORM_DoPageAAction",
      3
    );
    Module["_FORM_SetIndexSelected"] = createExportWrapper(
      "FORM_SetIndexSelected",
      4
    );
    Module["_FORM_IsIndexSelected"] = createExportWrapper(
      "FORM_IsIndexSelected",
      3
    );
    Module["_FPDFDoc_GetJavaScriptActionCount"] = createExportWrapper("FPDFDoc_GetJavaScriptActionCount", 1);
    Module["_FPDFDoc_GetJavaScriptAction"] = createExportWrapper("FPDFDoc_GetJavaScriptAction", 2);
    Module["_FPDFDoc_CloseJavaScriptAction"] = createExportWrapper("FPDFDoc_CloseJavaScriptAction", 1);
    Module["_FPDFJavaScriptAction_GetName"] = createExportWrapper("FPDFJavaScriptAction_GetName", 3);
    Module["_FPDFJavaScriptAction_GetScript"] = createExportWrapper("FPDFJavaScriptAction_GetScript", 3);
    Module["_FPDF_ImportPagesByIndex"] = createExportWrapper(
      "FPDF_ImportPagesByIndex",
      5
    );
    Module["_FPDF_ImportPages"] = createExportWrapper(
      "FPDF_ImportPages",
      4
    );
    Module["_FPDF_ImportNPagesToOne"] = createExportWrapper(
      "FPDF_ImportNPagesToOne",
      5
    );
    Module["_FPDF_NewXObjectFromPage"] = createExportWrapper(
      "FPDF_NewXObjectFromPage",
      3
    );
    Module["_FPDF_CloseXObject"] = createExportWrapper(
      "FPDF_CloseXObject",
      1
    );
    Module["_FPDF_NewFormObjectFromXObject"] = createExportWrapper("FPDF_NewFormObjectFromXObject", 1);
    Module["_FPDF_CopyViewerPreferences"] = createExportWrapper(
      "FPDF_CopyViewerPreferences",
      2
    );
    Module["_FPDF_RenderPageBitmapWithColorScheme_Start"] = createExportWrapper("FPDF_RenderPageBitmapWithColorScheme_Start", 10);
    Module["_FPDF_RenderPageBitmap_Start"] = createExportWrapper("FPDF_RenderPageBitmap_Start", 9);
    Module["_FPDF_RenderPage_Continue"] = createExportWrapper(
      "FPDF_RenderPage_Continue",
      2
    );
    Module["_FPDF_RenderPage_Close"] = createExportWrapper(
      "FPDF_RenderPage_Close",
      1
    );
    Module["_FPDF_SaveWithVersion"] = createExportWrapper(
      "FPDF_SaveWithVersion",
      4
    );
    Module["_FPDFText_GetCharIndexFromTextIndex"] = createExportWrapper("FPDFText_GetCharIndexFromTextIndex", 2);
    Module["_FPDFText_GetTextIndexFromCharIndex"] = createExportWrapper("FPDFText_GetTextIndexFromCharIndex", 2);
    Module["_FPDF_GetSignatureCount"] = createExportWrapper(
      "FPDF_GetSignatureCount",
      1
    );
    Module["_FPDF_GetSignatureObject"] = createExportWrapper(
      "FPDF_GetSignatureObject",
      2
    );
    Module["_FPDFSignatureObj_GetContents"] = createExportWrapper("FPDFSignatureObj_GetContents", 3);
    Module["_FPDFSignatureObj_GetByteRange"] = createExportWrapper("FPDFSignatureObj_GetByteRange", 3);
    Module["_FPDFSignatureObj_GetSubFilter"] = createExportWrapper("FPDFSignatureObj_GetSubFilter", 3);
    Module["_FPDFSignatureObj_GetReason"] = createExportWrapper(
      "FPDFSignatureObj_GetReason",
      3
    );
    Module["_FPDFSignatureObj_GetTime"] = createExportWrapper(
      "FPDFSignatureObj_GetTime",
      3
    );
    Module["_FPDFSignatureObj_GetDocMDPPermission"] = createExportWrapper("FPDFSignatureObj_GetDocMDPPermission", 1);
    Module["_FPDF_StructTree_GetForPage"] = createExportWrapper(
      "FPDF_StructTree_GetForPage",
      1
    );
    Module["_FPDF_StructTree_Close"] = createExportWrapper(
      "FPDF_StructTree_Close",
      1
    );
    Module["_FPDF_StructTree_CountChildren"] = createExportWrapper("FPDF_StructTree_CountChildren", 1);
    Module["_FPDF_StructTree_GetChildAtIndex"] = createExportWrapper("FPDF_StructTree_GetChildAtIndex", 2);
    Module["_FPDF_StructElement_GetAltText"] = createExportWrapper("FPDF_StructElement_GetAltText", 3);
    Module["_FPDF_StructElement_GetActualText"] = createExportWrapper("FPDF_StructElement_GetActualText", 3);
    Module["_FPDF_StructElement_GetID"] = createExportWrapper(
      "FPDF_StructElement_GetID",
      3
    );
    Module["_FPDF_StructElement_GetLang"] = createExportWrapper(
      "FPDF_StructElement_GetLang",
      3
    );
    Module["_FPDF_StructElement_GetAttributeCount"] = createExportWrapper("FPDF_StructElement_GetAttributeCount", 1);
    Module["_FPDF_StructElement_GetAttributeAtIndex"] = createExportWrapper("FPDF_StructElement_GetAttributeAtIndex", 2);
    Module["_FPDF_StructElement_GetStringAttribute"] = createExportWrapper("FPDF_StructElement_GetStringAttribute", 4);
    Module["_FPDF_StructElement_GetMarkedContentID"] = createExportWrapper("FPDF_StructElement_GetMarkedContentID", 1);
    Module["_FPDF_StructElement_GetType"] = createExportWrapper(
      "FPDF_StructElement_GetType",
      3
    );
    Module["_FPDF_StructElement_GetObjType"] = createExportWrapper("FPDF_StructElement_GetObjType", 3);
    Module["_FPDF_StructElement_GetTitle"] = createExportWrapper("FPDF_StructElement_GetTitle", 3);
    Module["_FPDF_StructElement_CountChildren"] = createExportWrapper("FPDF_StructElement_CountChildren", 1);
    Module["_FPDF_StructElement_GetChildAtIndex"] = createExportWrapper("FPDF_StructElement_GetChildAtIndex", 2);
    Module["_FPDF_StructElement_GetChildMarkedContentID"] = createExportWrapper("FPDF_StructElement_GetChildMarkedContentID", 2);
    Module["_FPDF_StructElement_GetParent"] = createExportWrapper("FPDF_StructElement_GetParent", 1);
    Module["_FPDF_StructElement_Attr_GetCount"] = createExportWrapper("FPDF_StructElement_Attr_GetCount", 1);
    Module["_FPDF_StructElement_Attr_GetName"] = createExportWrapper("FPDF_StructElement_Attr_GetName", 5);
    Module["_FPDF_StructElement_Attr_GetValue"] = createExportWrapper("FPDF_StructElement_Attr_GetValue", 2);
    Module["_FPDF_StructElement_Attr_GetType"] = createExportWrapper("FPDF_StructElement_Attr_GetType", 1);
    Module["_FPDF_StructElement_Attr_GetBooleanValue"] = createExportWrapper("FPDF_StructElement_Attr_GetBooleanValue", 2);
    Module["_FPDF_StructElement_Attr_GetNumberValue"] = createExportWrapper("FPDF_StructElement_Attr_GetNumberValue", 2);
    Module["_FPDF_StructElement_Attr_GetStringValue"] = createExportWrapper("FPDF_StructElement_Attr_GetStringValue", 4);
    Module["_FPDF_StructElement_Attr_GetBlobValue"] = createExportWrapper("FPDF_StructElement_Attr_GetBlobValue", 4);
    Module["_FPDF_StructElement_Attr_CountChildren"] = createExportWrapper("FPDF_StructElement_Attr_CountChildren", 1);
    Module["_FPDF_StructElement_Attr_GetChildAtIndex"] = createExportWrapper("FPDF_StructElement_Attr_GetChildAtIndex", 2);
    Module["_FPDF_StructElement_GetMarkedContentIdCount"] = createExportWrapper("FPDF_StructElement_GetMarkedContentIdCount", 1);
    Module["_FPDF_StructElement_GetMarkedContentIdAtIndex"] = createExportWrapper("FPDF_StructElement_GetMarkedContentIdAtIndex", 2);
    Module["_FPDF_AddInstalledFont"] = createExportWrapper(
      "FPDF_AddInstalledFont",
      3
    );
    Module["_FPDF_SetSystemFontInfo"] = createExportWrapper(
      "FPDF_SetSystemFontInfo",
      1
    );
    Module["_FPDF_GetDefaultTTFMap"] = createExportWrapper(
      "FPDF_GetDefaultTTFMap",
      0
    );
    Module["_FPDF_GetDefaultTTFMapCount"] = createExportWrapper(
      "FPDF_GetDefaultTTFMapCount",
      0
    );
    Module["_FPDF_GetDefaultTTFMapEntry"] = createExportWrapper(
      "FPDF_GetDefaultTTFMapEntry",
      1
    );
    Module["_FPDF_GetDefaultSystemFontInfo"] = createExportWrapper("FPDF_GetDefaultSystemFontInfo", 0);
    Module["_FPDF_FreeDefaultSystemFontInfo"] = createExportWrapper("FPDF_FreeDefaultSystemFontInfo", 1);
    Module["_FPDFText_LoadPage"] = createExportWrapper(
      "FPDFText_LoadPage",
      1
    );
    Module["_FPDFText_ClosePage"] = createExportWrapper(
      "FPDFText_ClosePage",
      1
    );
    Module["_FPDFText_CountChars"] = createExportWrapper(
      "FPDFText_CountChars",
      1
    );
    Module["_FPDFText_GetUnicode"] = createExportWrapper(
      "FPDFText_GetUnicode",
      2
    );
    Module["_FPDFText_GetTextObject"] = createExportWrapper(
      "FPDFText_GetTextObject",
      2
    );
    Module["_FPDFText_IsGenerated"] = createExportWrapper(
      "FPDFText_IsGenerated",
      2
    );
    Module["_FPDFText_IsHyphen"] = createExportWrapper(
      "FPDFText_IsHyphen",
      2
    );
    Module["_FPDFText_HasUnicodeMapError"] = createExportWrapper("FPDFText_HasUnicodeMapError", 2);
    Module["_FPDFText_GetFontSize"] = createExportWrapper(
      "FPDFText_GetFontSize",
      2
    );
    Module["_FPDFText_GetFontInfo"] = createExportWrapper(
      "FPDFText_GetFontInfo",
      5
    );
    Module["_FPDFText_GetFontWeight"] = createExportWrapper(
      "FPDFText_GetFontWeight",
      2
    );
    Module["_FPDFText_GetFillColor"] = createExportWrapper(
      "FPDFText_GetFillColor",
      6
    );
    Module["_FPDFText_GetStrokeColor"] = createExportWrapper(
      "FPDFText_GetStrokeColor",
      6
    );
    Module["_FPDFText_GetCharAngle"] = createExportWrapper(
      "FPDFText_GetCharAngle",
      2
    );
    Module["_FPDFText_GetCharBox"] = createExportWrapper(
      "FPDFText_GetCharBox",
      6
    );
    Module["_FPDFText_GetLooseCharBox"] = createExportWrapper(
      "FPDFText_GetLooseCharBox",
      3
    );
    Module["_FPDFText_GetMatrix"] = createExportWrapper(
      "FPDFText_GetMatrix",
      3
    );
    Module["_FPDFText_GetCharOrigin"] = createExportWrapper(
      "FPDFText_GetCharOrigin",
      4
    );
    Module["_FPDFText_GetCharIndexAtPos"] = createExportWrapper(
      "FPDFText_GetCharIndexAtPos",
      5
    );
    Module["_FPDFText_GetText"] = createExportWrapper(
      "FPDFText_GetText",
      4
    );
    Module["_FPDFText_CountRects"] = createExportWrapper(
      "FPDFText_CountRects",
      3
    );
    Module["_FPDFText_GetRect"] = createExportWrapper(
      "FPDFText_GetRect",
      6
    );
    Module["_FPDFText_GetBoundedText"] = createExportWrapper(
      "FPDFText_GetBoundedText",
      7
    );
    Module["_FPDFText_FindStart"] = createExportWrapper(
      "FPDFText_FindStart",
      4
    );
    Module["_FPDFText_FindNext"] = createExportWrapper(
      "FPDFText_FindNext",
      1
    );
    Module["_FPDFText_FindPrev"] = createExportWrapper(
      "FPDFText_FindPrev",
      1
    );
    Module["_FPDFText_GetSchResultIndex"] = createExportWrapper(
      "FPDFText_GetSchResultIndex",
      1
    );
    Module["_FPDFText_GetSchCount"] = createExportWrapper(
      "FPDFText_GetSchCount",
      1
    );
    Module["_FPDFText_FindClose"] = createExportWrapper(
      "FPDFText_FindClose",
      1
    );
    Module["_FPDFLink_LoadWebLinks"] = createExportWrapper(
      "FPDFLink_LoadWebLinks",
      1
    );
    Module["_FPDFLink_CountWebLinks"] = createExportWrapper(
      "FPDFLink_CountWebLinks",
      1
    );
    Module["_FPDFLink_GetURL"] = createExportWrapper("FPDFLink_GetURL", 4);
    Module["_FPDFLink_CountRects"] = createExportWrapper(
      "FPDFLink_CountRects",
      2
    );
    Module["_FPDFLink_GetRect"] = createExportWrapper(
      "FPDFLink_GetRect",
      7
    );
    Module["_FPDFLink_GetTextRange"] = createExportWrapper(
      "FPDFLink_GetTextRange",
      4
    );
    Module["_FPDFLink_CloseWebLinks"] = createExportWrapper(
      "FPDFLink_CloseWebLinks",
      1
    );
    Module["_FPDFPage_GetDecodedThumbnailData"] = createExportWrapper("FPDFPage_GetDecodedThumbnailData", 3);
    Module["_FPDFPage_GetRawThumbnailData"] = createExportWrapper("FPDFPage_GetRawThumbnailData", 3);
    Module["_FPDFPage_GetThumbnailAsBitmap"] = createExportWrapper("FPDFPage_GetThumbnailAsBitmap", 1);
    Module["_FPDFPage_SetMediaBox"] = createExportWrapper(
      "FPDFPage_SetMediaBox",
      5
    );
    Module["_FPDFPage_SetCropBox"] = createExportWrapper(
      "FPDFPage_SetCropBox",
      5
    );
    Module["_FPDFPage_SetBleedBox"] = createExportWrapper(
      "FPDFPage_SetBleedBox",
      5
    );
    Module["_FPDFPage_SetTrimBox"] = createExportWrapper(
      "FPDFPage_SetTrimBox",
      5
    );
    Module["_FPDFPage_SetArtBox"] = createExportWrapper(
      "FPDFPage_SetArtBox",
      5
    );
    Module["_FPDFPage_GetMediaBox"] = createExportWrapper(
      "FPDFPage_GetMediaBox",
      5
    );
    Module["_FPDFPage_GetCropBox"] = createExportWrapper(
      "FPDFPage_GetCropBox",
      5
    );
    Module["_FPDFPage_GetBleedBox"] = createExportWrapper(
      "FPDFPage_GetBleedBox",
      5
    );
    Module["_FPDFPage_GetTrimBox"] = createExportWrapper(
      "FPDFPage_GetTrimBox",
      5
    );
    Module["_FPDFPage_GetArtBox"] = createExportWrapper(
      "FPDFPage_GetArtBox",
      5
    );
    Module["_FPDFPage_TransFormWithClip"] = createExportWrapper(
      "FPDFPage_TransFormWithClip",
      3
    );
    Module["_FPDFPageObj_TransformClipPath"] = createExportWrapper("FPDFPageObj_TransformClipPath", 7);
    Module["_FPDFPageObj_GetClipPath"] = createExportWrapper(
      "FPDFPageObj_GetClipPath",
      1
    );
    Module["_FPDFClipPath_CountPaths"] = createExportWrapper(
      "FPDFClipPath_CountPaths",
      1
    );
    Module["_FPDFClipPath_CountPathSegments"] = createExportWrapper("FPDFClipPath_CountPathSegments", 2);
    Module["_FPDFClipPath_GetPathSegment"] = createExportWrapper("FPDFClipPath_GetPathSegment", 3);
    Module["_FPDF_CreateClipPath"] = createExportWrapper(
      "FPDF_CreateClipPath",
      4
    );
    Module["_FPDF_DestroyClipPath"] = createExportWrapper(
      "FPDF_DestroyClipPath",
      1
    );
    Module["_FPDFPage_InsertClipPath"] = createExportWrapper(
      "FPDFPage_InsertClipPath",
      2
    );
    Module["_FPDF_InitLibrary"] = createExportWrapper(
      "FPDF_InitLibrary",
      0
    );
    Module["_FPDF_DestroyLibrary"] = createExportWrapper(
      "FPDF_DestroyLibrary",
      0
    );
    Module["_FPDF_SetSandBoxPolicy"] = createExportWrapper(
      "FPDF_SetSandBoxPolicy",
      2
    );
    Module["_FPDF_LoadDocument"] = createExportWrapper(
      "FPDF_LoadDocument",
      2
    );
    Module["_FPDF_GetFormType"] = createExportWrapper(
      "FPDF_GetFormType",
      1
    );
    Module["_FPDF_LoadXFA"] = createExportWrapper("FPDF_LoadXFA", 1);
    Module["_FPDF_LoadMemDocument"] = createExportWrapper(
      "FPDF_LoadMemDocument",
      3
    );
    Module["_FPDF_LoadMemDocument64"] = createExportWrapper(
      "FPDF_LoadMemDocument64",
      3
    );
    Module["_FPDF_LoadCustomDocument"] = createExportWrapper(
      "FPDF_LoadCustomDocument",
      2
    );
    Module["_FPDF_GetFileVersion"] = createExportWrapper(
      "FPDF_GetFileVersion",
      2
    );
    Module["_FPDF_DocumentHasValidCrossReferenceTable"] = createExportWrapper("FPDF_DocumentHasValidCrossReferenceTable", 1);
    Module["_FPDF_GetDocPermissions"] = createExportWrapper(
      "FPDF_GetDocPermissions",
      1
    );
    Module["_FPDF_GetDocUserPermissions"] = createExportWrapper(
      "FPDF_GetDocUserPermissions",
      1
    );
    Module["_FPDF_GetSecurityHandlerRevision"] = createExportWrapper("FPDF_GetSecurityHandlerRevision", 1);
    Module["_FPDF_GetPageCount"] = createExportWrapper(
      "FPDF_GetPageCount",
      1
    );
    Module["_FPDF_LoadPage"] = createExportWrapper("FPDF_LoadPage", 2);
    Module["_FPDF_GetPageWidthF"] = createExportWrapper(
      "FPDF_GetPageWidthF",
      1
    );
    Module["_FPDF_GetPageWidth"] = createExportWrapper(
      "FPDF_GetPageWidth",
      1
    );
    Module["_FPDF_GetPageHeightF"] = createExportWrapper(
      "FPDF_GetPageHeightF",
      1
    );
    Module["_FPDF_GetPageHeight"] = createExportWrapper(
      "FPDF_GetPageHeight",
      1
    );
    Module["_FPDF_GetPageBoundingBox"] = createExportWrapper(
      "FPDF_GetPageBoundingBox",
      2
    );
    Module["_FPDF_RenderPageBitmap"] = createExportWrapper(
      "FPDF_RenderPageBitmap",
      8
    );
    Module["_FPDF_RenderPageBitmapWithMatrix"] = createExportWrapper("FPDF_RenderPageBitmapWithMatrix", 5);
    Module["_EPDF_RenderAnnotBitmap"] = createExportWrapper(
      "EPDF_RenderAnnotBitmap",
      6
    );
    Module["_FPDF_ClosePage"] = createExportWrapper("FPDF_ClosePage", 1);
    Module["_FPDF_CloseDocument"] = createExportWrapper(
      "FPDF_CloseDocument",
      1
    );
    Module["_FPDF_GetLastError"] = createExportWrapper(
      "FPDF_GetLastError",
      0
    );
    Module["_FPDF_DeviceToPage"] = createExportWrapper(
      "FPDF_DeviceToPage",
      10
    );
    Module["_FPDF_PageToDevice"] = createExportWrapper(
      "FPDF_PageToDevice",
      10
    );
    Module["_FPDFBitmap_Create"] = createExportWrapper(
      "FPDFBitmap_Create",
      3
    );
    Module["_FPDFBitmap_CreateEx"] = createExportWrapper(
      "FPDFBitmap_CreateEx",
      5
    );
    Module["_FPDFBitmap_GetFormat"] = createExportWrapper(
      "FPDFBitmap_GetFormat",
      1
    );
    Module["_FPDFBitmap_FillRect"] = createExportWrapper(
      "FPDFBitmap_FillRect",
      6
    );
    Module["_FPDFBitmap_GetBuffer"] = createExportWrapper(
      "FPDFBitmap_GetBuffer",
      1
    );
    Module["_FPDFBitmap_GetWidth"] = createExportWrapper(
      "FPDFBitmap_GetWidth",
      1
    );
    Module["_FPDFBitmap_GetHeight"] = createExportWrapper(
      "FPDFBitmap_GetHeight",
      1
    );
    Module["_FPDFBitmap_GetStride"] = createExportWrapper(
      "FPDFBitmap_GetStride",
      1
    );
    Module["_FPDFBitmap_Destroy"] = createExportWrapper(
      "FPDFBitmap_Destroy",
      1
    );
    Module["_FPDF_GetPageSizeByIndexF"] = createExportWrapper(
      "FPDF_GetPageSizeByIndexF",
      3
    );
    Module["_EPDF_GetPageRotationByIndex"] = createExportWrapper("EPDF_GetPageRotationByIndex", 2);
    Module["_FPDF_GetPageSizeByIndex"] = createExportWrapper(
      "FPDF_GetPageSizeByIndex",
      4
    );
    Module["_FPDF_VIEWERREF_GetPrintScaling"] = createExportWrapper("FPDF_VIEWERREF_GetPrintScaling", 1);
    Module["_FPDF_VIEWERREF_GetNumCopies"] = createExportWrapper("FPDF_VIEWERREF_GetNumCopies", 1);
    Module["_FPDF_VIEWERREF_GetPrintPageRange"] = createExportWrapper("FPDF_VIEWERREF_GetPrintPageRange", 1);
    Module["_FPDF_VIEWERREF_GetPrintPageRangeCount"] = createExportWrapper("FPDF_VIEWERREF_GetPrintPageRangeCount", 1);
    Module["_FPDF_VIEWERREF_GetPrintPageRangeElement"] = createExportWrapper("FPDF_VIEWERREF_GetPrintPageRangeElement", 2);
    Module["_FPDF_VIEWERREF_GetDuplex"] = createExportWrapper(
      "FPDF_VIEWERREF_GetDuplex",
      1
    );
    Module["_FPDF_VIEWERREF_GetName"] = createExportWrapper(
      "FPDF_VIEWERREF_GetName",
      4
    );
    Module["_FPDF_CountNamedDests"] = createExportWrapper(
      "FPDF_CountNamedDests",
      1
    );
    Module["_FPDF_GetNamedDestByName"] = createExportWrapper(
      "FPDF_GetNamedDestByName",
      2
    );
    Module["_FPDF_GetNamedDest"] = createExportWrapper(
      "FPDF_GetNamedDest",
      4
    );
    Module["_FPDF_GetXFAPacketCount"] = createExportWrapper(
      "FPDF_GetXFAPacketCount",
      1
    );
    Module["_FPDF_GetXFAPacketName"] = createExportWrapper(
      "FPDF_GetXFAPacketName",
      4
    );
    Module["_FPDF_GetXFAPacketContent"] = createExportWrapper(
      "FPDF_GetXFAPacketContent",
      5
    );
    Module["_FPDF_GetTrailerEnds"] = createExportWrapper(
      "FPDF_GetTrailerEnds",
      3
    );
    var _fflush = createExportWrapper("fflush", 1);
    var _emscripten_builtin_memalign = createExportWrapper("emscripten_builtin_memalign", 2);
    var _strerror = createExportWrapper("strerror", 1);
    var _setThrew = createExportWrapper("setThrew", 2);
    var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports["emscripten_stack_init"])();
    var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports["emscripten_stack_get_end"])();
    var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports["_emscripten_stack_restore"])(a0);
    var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"])(a0);
    var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"])();
    Module["dynCall_ji"] = createExportWrapper("dynCall_ji", 2);
    Module["dynCall_jij"] = createExportWrapper("dynCall_jij", 4);
    Module["dynCall_iiij"] = createExportWrapper("dynCall_iiij", 5);
    Module["dynCall_iij"] = createExportWrapper("dynCall_iij", 4);
    Module["dynCall_j"] = createExportWrapper("dynCall_j", 1);
    Module["dynCall_jji"] = createExportWrapper("dynCall_jji", 4);
    Module["dynCall_iji"] = createExportWrapper("dynCall_iji", 4);
    Module["dynCall_viijii"] = createExportWrapper("dynCall_viijii", 7);
    Module["dynCall_iiji"] = createExportWrapper("dynCall_iiji", 5);
    Module["dynCall_jiji"] = createExportWrapper("dynCall_jiji", 5);
    Module["dynCall_iiiiij"] = createExportWrapper("dynCall_iiiiij", 7);
    Module["dynCall_iiiiijj"] = createExportWrapper("dynCall_iiiiijj", 9);
    Module["dynCall_iiiiiijj"] = createExportWrapper(
      "dynCall_iiiiiijj",
      10
    );
    Module["dynCall_viji"] = createExportWrapper("dynCall_viji", 5);
    function invoke_viii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        getWasmTableEntry(index)(a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_ii(index, a1) {
      var sp = stackSave();
      try {
        return getWasmTableEntry(index)(a1);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iii(index, a1, a2) {
      var sp = stackSave();
      try {
        return getWasmTableEntry(index)(a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiii(index, a1, a2, a3) {
      var sp = stackSave();
      try {
        return getWasmTableEntry(index)(a1, a2, a3);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        getWasmTableEntry(index)(a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_iiiii(index, a1, a2, a3, a4) {
      var sp = stackSave();
      try {
        return getWasmTableEntry(index)(a1, a2, a3, a4);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_v(index) {
      var sp = stackSave();
      try {
        getWasmTableEntry(index)();
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_vii(index, a1, a2) {
      var sp = stackSave();
      try {
        getWasmTableEntry(index)(a1, a2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
      var sp = stackSave();
      try {
        getWasmTableEntry(index)(a1, a2, a3, a4, a5, a6, a7, a8, a9);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
      }
    }
    Module["wasmExports"] = wasmExports;
    Module["ccall"] = ccall;
    Module["cwrap"] = cwrap;
    Module["addFunction"] = addFunction;
    Module["removeFunction"] = removeFunction;
    Module["setValue"] = setValue;
    Module["getValue"] = getValue;
    Module["UTF8ToString"] = UTF8ToString;
    Module["stringToUTF8"] = stringToUTF8;
    Module["UTF16ToString"] = UTF16ToString;
    Module["stringToUTF16"] = stringToUTF16;
    var missingLibrarySymbols = [
      "writeI53ToI64",
      "writeI53ToI64Clamped",
      "writeI53ToI64Signaling",
      "writeI53ToU64Clamped",
      "writeI53ToU64Signaling",
      "readI53FromI64",
      "readI53FromU64",
      "convertI32PairToI53",
      "convertU32PairToI53",
      "getTempRet0",
      "setTempRet0",
      "exitJS",
      "inetPton4",
      "inetNtop4",
      "inetPton6",
      "inetNtop6",
      "readSockaddr",
      "writeSockaddr",
      "emscriptenLog",
      "readEmAsmArgs",
      "jstoi_q",
      "listenOnce",
      "autoResumeAudioContext",
      "dynCallLegacy",
      "getDynCaller",
      "dynCall",
      "handleException",
      "keepRuntimeAlive",
      "runtimeKeepalivePush",
      "runtimeKeepalivePop",
      "callUserCallback",
      "maybeExit",
      "asmjsMangle",
      "HandleAllocator",
      "getNativeTypeSize",
      "STACK_SIZE",
      "STACK_ALIGN",
      "POINTER_SIZE",
      "ASSERTIONS",
      "reallyNegative",
      "unSign",
      "strLen",
      "reSign",
      "formatString",
      "intArrayToString",
      "AsciiToString",
      "lengthBytesUTF16",
      "UTF32ToString",
      "stringToUTF32",
      "lengthBytesUTF32",
      "stringToNewUTF8",
      "registerKeyEventCallback",
      "maybeCStringToJsString",
      "findEventTarget",
      "getBoundingClientRect",
      "fillMouseEventData",
      "registerMouseEventCallback",
      "registerWheelEventCallback",
      "registerUiEventCallback",
      "registerFocusEventCallback",
      "fillDeviceOrientationEventData",
      "registerDeviceOrientationEventCallback",
      "fillDeviceMotionEventData",
      "registerDeviceMotionEventCallback",
      "screenOrientation",
      "fillOrientationChangeEventData",
      "registerOrientationChangeEventCallback",
      "fillFullscreenChangeEventData",
      "registerFullscreenChangeEventCallback",
      "JSEvents_requestFullscreen",
      "JSEvents_resizeCanvasForFullscreen",
      "registerRestoreOldStyle",
      "hideEverythingExceptGivenElement",
      "restoreHiddenElements",
      "setLetterbox",
      "softFullscreenResizeWebGLRenderTarget",
      "doRequestFullscreen",
      "fillPointerlockChangeEventData",
      "registerPointerlockChangeEventCallback",
      "registerPointerlockErrorEventCallback",
      "requestPointerLock",
      "fillVisibilityChangeEventData",
      "registerVisibilityChangeEventCallback",
      "registerTouchEventCallback",
      "fillGamepadEventData",
      "registerGamepadEventCallback",
      "registerBeforeUnloadEventCallback",
      "fillBatteryEventData",
      "battery",
      "registerBatteryEventCallback",
      "setCanvasElementSize",
      "getCanvasElementSize",
      "jsStackTrace",
      "getCallstack",
      "convertPCtoSourceLocation",
      "checkWasiClock",
      "wasiRightsToMuslOFlags",
      "wasiOFlagsToMuslOFlags",
      "createDyncallWrapper",
      "safeSetTimeout",
      "setImmediateWrapped",
      "clearImmediateWrapped",
      "polyfillSetImmediate",
      "registerPostMainLoop",
      "registerPreMainLoop",
      "getPromise",
      "makePromise",
      "idsToPromises",
      "makePromiseCallback",
      "ExceptionInfo",
      "findMatchingCatch",
      "Browser_asyncPrepareDataCounter",
      "safeRequestAnimationFrame",
      "arraySum",
      "addDays",
      "getSocketFromFD",
      "getSocketAddress",
      "FS_unlink",
      "FS_mkdirTree",
      "_setNetworkCallback",
      "heapObjectForWebGLType",
      "toTypedArrayIndex",
      "webgl_enable_ANGLE_instanced_arrays",
      "webgl_enable_OES_vertex_array_object",
      "webgl_enable_WEBGL_draw_buffers",
      "webgl_enable_WEBGL_multi_draw",
      "webgl_enable_EXT_polygon_offset_clamp",
      "webgl_enable_EXT_clip_control",
      "webgl_enable_WEBGL_polygon_mode",
      "emscriptenWebGLGet",
      "computeUnpackAlignedImageSize",
      "colorChannelsInGlTextureFormat",
      "emscriptenWebGLGetTexPixelData",
      "emscriptenWebGLGetUniform",
      "webglGetUniformLocation",
      "webglPrepareUniformLocationsBeforeFirstUse",
      "webglGetLeftBracePos",
      "emscriptenWebGLGetVertexAttrib",
      "__glGetActiveAttribOrUniform",
      "writeGLArray",
      "registerWebGlEventCallback",
      "runAndAbortIfError",
      "ALLOC_NORMAL",
      "ALLOC_STACK",
      "allocate",
      "writeStringToMemory",
      "writeAsciiToMemory",
      "setErrNo",
      "demangle",
      "stackTrace"
    ];
    missingLibrarySymbols.forEach(missingLibrarySymbol);
    var unexportedSymbols = [
      "run",
      "addOnPreRun",
      "addOnInit",
      "addOnPreMain",
      "addOnExit",
      "addOnPostRun",
      "addRunDependency",
      "removeRunDependency",
      "out",
      "err",
      "callMain",
      "abort",
      "wasmMemory",
      "writeStackCookie",
      "checkStackCookie",
      "convertI32PairToI53Checked",
      "stackSave",
      "stackRestore",
      "stackAlloc",
      "ptrToString",
      "zeroMemory",
      "getHeapMax",
      "growMemory",
      "ENV",
      "ERRNO_CODES",
      "strError",
      "DNS",
      "Protocols",
      "Sockets",
      "initRandomFill",
      "randomFill",
      "timers",
      "warnOnce",
      "readEmAsmArgsArray",
      "jstoi_s",
      "getExecutableName",
      "asyncLoad",
      "alignMemory",
      "mmapAlloc",
      "wasmTable",
      "noExitRuntime",
      "getCFunc",
      "uleb128Encode",
      "sigToWasmTypes",
      "generateFuncType",
      "convertJsFunctionToWasm",
      "freeTableIndexes",
      "functionsInTableMap",
      "getEmptyTableSlot",
      "updateTableMap",
      "getFunctionAddress",
      "PATH",
      "PATH_FS",
      "UTF8Decoder",
      "UTF8ArrayToString",
      "stringToUTF8Array",
      "lengthBytesUTF8",
      "intArrayFromString",
      "stringToAscii",
      "UTF16Decoder",
      "stringToUTF8OnStack",
      "writeArrayToMemory",
      "JSEvents",
      "specialHTMLTargets",
      "findCanvasEventTarget",
      "currentFullscreenStrategy",
      "restoreOldWindowedStyle",
      "UNWIND_CACHE",
      "ExitStatus",
      "getEnvStrings",
      "doReadv",
      "doWritev",
      "promiseMap",
      "uncaughtExceptionCount",
      "exceptionLast",
      "exceptionCaught",
      "Browser",
      "getPreloadedImageData__data",
      "wget",
      "MONTH_DAYS_REGULAR",
      "MONTH_DAYS_LEAP",
      "MONTH_DAYS_REGULAR_CUMULATIVE",
      "MONTH_DAYS_LEAP_CUMULATIVE",
      "isLeapYear",
      "ydayFromDate",
      "SYSCALLS",
      "preloadPlugins",
      "FS_createPreloadedFile",
      "FS_modeStringToFlags",
      "FS_getMode",
      "FS_stdin_getChar_buffer",
      "FS_stdin_getChar",
      "FS_createPath",
      "FS_createDevice",
      "FS_readFile",
      "FS",
      "FS_createDataFile",
      "FS_createLazyFile",
      "MEMFS",
      "TTY",
      "PIPEFS",
      "SOCKFS",
      "tempFixedLengthArray",
      "miniTempWebGLFloatBuffers",
      "miniTempWebGLIntBuffers",
      "GL",
      "AL",
      "GLUT",
      "EGL",
      "GLEW",
      "IDBStore",
      "SDL",
      "SDL_gfx",
      "allocateUTF8",
      "allocateUTF8OnStack",
      "print",
      "printErr"
    ];
    unexportedSymbols.forEach(unexportedRuntimeSymbol);
    var calledRun;
    var calledPrerun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function stackCheckInit() {
      _emscripten_stack_init();
      writeStackCookie();
    }
    function run() {
      if (runDependencies > 0) {
        return;
      }
      stackCheckInit();
      if (!calledPrerun) {
        calledPrerun = 1;
        preRun();
        if (runDependencies > 0) {
          return;
        }
      }
      function doRun() {
        var _a;
        if (calledRun) return;
        calledRun = 1;
        Module["calledRun"] = 1;
        if (ABORT) return;
        initRuntime();
        readyPromiseResolve(Module);
        (_a = Module["onRuntimeInitialized"]) == null ? void 0 : _a.call(Module);
        assert(
          !Module["_main"],
          'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]'
        );
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(() => {
          setTimeout(() => Module["setStatus"](""), 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
      checkStackCookie();
    }
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    run();
    moduleRtn = readyPromise;
    for (const prop of Object.keys(Module)) {
      if (!(prop in moduleArg)) {
        Object.defineProperty(moduleArg, prop, {
          configurable: true,
          get() {
            abort(
              \`Access to module property ('\${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.\`
            );
          }
        });
      }
    }
    return moduleRtn;
  };
})();
const functions = {
  EPDF_GetMetaKeyCount: [["number", "boolean"], "number"],
  EPDF_GetMetaKeyName: [
    ["number", "number", "boolean", "number", "number"],
    "number"
  ],
  EPDF_GetMetaTrapped: [["number"], "number"],
  EPDF_GetPageRotationByIndex: [["number", "number"], "number"],
  EPDF_HasMetaText: [["number", "string"], "boolean"],
  EPDF_PNG_EncodeRGBA: [
    ["number", "number", "number", "number", "number", "number"],
    "number"
  ],
  EPDF_RenderAnnotBitmap: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDF_SetMetaText: [["number", "string", "number"], "boolean"],
  EPDF_SetMetaTrapped: [["number", "number"], "boolean"],
  EPDFAction_CreateGoTo: [["number", "number"], "number"],
  EPDFAction_CreateGoToNamed: [["number", "string"], "number"],
  EPDFAction_CreateLaunch: [["number", "number"], "number"],
  EPDFAction_CreateRemoteGoToByName: [["number", "number", "number"], "number"],
  EPDFAction_CreateRemoteGoToDest: [["number", "number", "number"], "number"],
  EPDFAction_CreateURI: [["number", "string"], "number"],
  EPDFAnnot_ClearColor: [["number", "number"], "boolean"],
  EPDFAnnot_GenerateAppearance: [["number"], "boolean"],
  EPDFAnnot_GenerateAppearanceWithBlend: [["number", "number"], "boolean"],
  EPDFAnnot_GetBlendMode: [["number"], "number"],
  EPDFAnnot_GetBorderDashPattern: [["number", "number", "number"], "boolean"],
  EPDFAnnot_GetBorderDashPatternCount: [["number"], "number"],
  EPDFAnnot_GetBorderEffect: [["number", "number"], "boolean"],
  EPDFAnnot_GetBorderStyle: [["number", "number"], "number"],
  EPDFAnnot_GetColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDFAnnot_GetDefaultAppearance: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDFAnnot_GetIcon: [["number"], "number"],
  EPDFAnnot_GetIntent: [["number", "number", "number"], "number"],
  EPDFAnnot_GetLineEndings: [["number", "number", "number"], "boolean"],
  EPDFAnnot_GetOpacity: [["number", "number"], "boolean"],
  EPDFAnnot_GetRectangleDifferences: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDFAnnot_GetRichContent: [["number", "number", "number"], "number"],
  EPDFAnnot_GetTextAlignment: [["number"], "number"],
  EPDFAnnot_GetVerticalAlignment: [["number"], "number"],
  EPDFAnnot_SetBorderDashPattern: [["number", "number", "number"], "boolean"],
  EPDFAnnot_SetBorderStyle: [["number", "number", "number"], "boolean"],
  EPDFAnnot_SetColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDFAnnot_SetDefaultAppearance: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  EPDFAnnot_SetIcon: [["number", "number"], "boolean"],
  EPDFAnnot_SetIntent: [["number", "string"], "boolean"],
  EPDFAnnot_SetLine: [["number", "number", "number"], "boolean"],
  EPDFAnnot_SetLineEndings: [["number", "number", "number"], "boolean"],
  EPDFAnnot_SetLinkedAnnot: [["number", "string", "number"], "boolean"],
  EPDFAnnot_SetOpacity: [["number", "number"], "boolean"],
  EPDFAnnot_SetTextAlignment: [["number", "number"], "boolean"],
  EPDFAnnot_SetVerticalAlignment: [["number", "number"], "boolean"],
  EPDFAnnot_SetVertices: [["number", "number", "number"], "boolean"],
  EPDFAnnot_UpdateAppearanceToRect: [["number", "number"], "boolean"],
  EPDFAttachment_GetDescription: [["number", "number", "number"], "number"],
  EPDFAttachment_GetIntegerValue: [["number", "string", "number"], "boolean"],
  EPDFAttachment_SetDescription: [["number", "number"], "boolean"],
  EPDFAttachment_SetSubtype: [["number", "string"], "boolean"],
  EPDFBookmark_AppendChild: [["number", "number", "number"], "number"],
  EPDFBookmark_Clear: [["number"], "boolean"],
  EPDFBookmark_ClearTarget: [["number"], "boolean"],
  EPDFBookmark_Create: [["number", "number"], "number"],
  EPDFBookmark_Delete: [["number", "number"], "boolean"],
  EPDFBookmark_InsertAfter: [["number", "number", "number", "number"], "number"],
  EPDFBookmark_SetAction: [["number", "number", "number"], "boolean"],
  EPDFBookmark_SetDest: [["number", "number", "number"], "boolean"],
  EPDFBookmark_SetTitle: [["number", "number"], "boolean"],
  EPDFCatalog_GetLanguage: [["number", "number", "number"], "number"],
  EPDFDest_CreateRemoteView: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  EPDFDest_CreateRemoteXYZ: [
    ["number", "number", "boolean", "number", "boolean", "number", "boolean", "number"],
    "number"
  ],
  EPDFDest_CreateView: [["number", "number", "number", "number"], "number"],
  EPDFDest_CreateXYZ: [
    ["number", "boolean", "number", "boolean", "number", "boolean", "number"],
    "number"
  ],
  EPDFNamedDest_Remove: [["number", "string"], "boolean"],
  EPDFNamedDest_SetDest: [["number", "string", "number"], "boolean"],
  EPDFPage_CreateAnnot: [["number", "number"], "number"],
  EPDFPage_GetAnnotByName: [["number", "number"], "number"],
  EPDFPage_GetAnnotCountRaw: [["number", "number"], "number"],
  EPDFPage_GetAnnotRaw: [["number", "number", "number"], "number"],
  EPDFPage_RemoveAnnotByName: [["number", "number"], "boolean"],
  EPDFPage_RemoveAnnotRaw: [["number", "number", "number"], "boolean"],
  EPDFText_RedactInQuads: [
    ["number", "number", "number", "boolean", "boolean"],
    "boolean"
  ],
  EPDFText_RedactInRect: [["number", "number", "boolean", "boolean"], "boolean"],
  FORM_CanRedo: [["number", "number"], "boolean"],
  FORM_CanUndo: [["number", "number"], "boolean"],
  FORM_DoDocumentAAction: [["number", "number"], null],
  FORM_DoDocumentJSAction: [["number"], null],
  FORM_DoDocumentOpenAction: [["number"], null],
  FORM_DoPageAAction: [["number", "number", "number"], null],
  FORM_ForceToKillFocus: [["number"], "boolean"],
  FORM_GetFocusedAnnot: [["number", "number", "number"], "boolean"],
  FORM_GetFocusedText: [["number", "number", "number", "number"], "number"],
  FORM_GetSelectedText: [["number", "number", "number", "number"], "number"],
  FORM_IsIndexSelected: [["number", "number", "number"], "boolean"],
  FORM_OnAfterLoadPage: [["number", "number"], null],
  FORM_OnBeforeClosePage: [["number", "number"], null],
  FORM_OnChar: [["number", "number", "number", "number"], "boolean"],
  FORM_OnFocus: [["number", "number", "number", "number", "number"], "boolean"],
  FORM_OnKeyDown: [["number", "number", "number", "number"], "boolean"],
  FORM_OnKeyUp: [["number", "number", "number", "number"], "boolean"],
  FORM_OnLButtonDoubleClick: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnLButtonDown: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnLButtonUp: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnMouseMove: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnMouseWheel: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnRButtonDown: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_OnRButtonUp: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FORM_Redo: [["number", "number"], "boolean"],
  FORM_ReplaceAndKeepSelection: [["number", "number", "number"], null],
  FORM_ReplaceSelection: [["number", "number", "number"], null],
  FORM_SelectAllText: [["number", "number"], "boolean"],
  FORM_SetFocusedAnnot: [["number", "number"], "boolean"],
  FORM_SetIndexSelected: [["number", "number", "number", "boolean"], "boolean"],
  FORM_Undo: [["number", "number"], "boolean"],
  FPDF_AddInstalledFont: [["number", "number", "number"], null],
  FPDF_CloseDocument: [["number"], null],
  FPDF_ClosePage: [["number"], null],
  FPDF_CloseXObject: [["number"], null],
  FPDF_CopyViewerPreferences: [["number", "number"], "boolean"],
  FPDF_CountNamedDests: [["number"], "number"],
  FPDF_CreateClipPath: [["number", "number", "number", "number"], "number"],
  FPDF_CreateNewDocument: [[], "number"],
  FPDF_DestroyClipPath: [["number"], null],
  FPDF_DestroyLibrary: [[], null],
  FPDF_DeviceToPage: [
    [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ],
    "boolean"
  ],
  FPDF_DocumentHasValidCrossReferenceTable: [["number"], "boolean"],
  FPDF_FFLDraw: [
    [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ],
    null
  ],
  FPDF_FreeDefaultSystemFontInfo: [["number"], null],
  FPDF_GetDefaultSystemFontInfo: [[], "number"],
  FPDF_GetDefaultTTFMap: [[], "number"],
  FPDF_GetDefaultTTFMapCount: [[], "number"],
  FPDF_GetDefaultTTFMapEntry: [["number"], "number"],
  FPDF_GetDocPermissions: [["number"], "number"],
  FPDF_GetDocUserPermissions: [["number"], "number"],
  FPDF_GetFileIdentifier: [["number", "number", "number", "number"], "number"],
  FPDF_GetFileVersion: [["number", "number"], "boolean"],
  FPDF_GetFormType: [["number"], "number"],
  FPDF_GetLastError: [[], "number"],
  FPDF_GetMetaText: [["number", "string", "number", "number"], "number"],
  FPDF_GetNamedDest: [["number", "number", "number", "number"], "number"],
  FPDF_GetNamedDestByName: [["number", "string"], "number"],
  FPDF_GetPageAAction: [["number", "number"], "number"],
  FPDF_GetPageBoundingBox: [["number", "number"], "boolean"],
  FPDF_GetPageCount: [["number"], "number"],
  FPDF_GetPageHeight: [["number"], "number"],
  FPDF_GetPageHeightF: [["number"], "number"],
  FPDF_GetPageLabel: [["number", "number", "number", "number"], "number"],
  FPDF_GetPageSizeByIndex: [["number", "number", "number", "number"], "number"],
  FPDF_GetPageSizeByIndexF: [["number", "number", "number"], "boolean"],
  FPDF_GetPageWidth: [["number"], "number"],
  FPDF_GetPageWidthF: [["number"], "number"],
  FPDF_GetSecurityHandlerRevision: [["number"], "number"],
  FPDF_GetSignatureCount: [["number"], "number"],
  FPDF_GetSignatureObject: [["number", "number"], "number"],
  FPDF_GetTrailerEnds: [["number", "number", "number"], "number"],
  FPDF_GetXFAPacketContent: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDF_GetXFAPacketCount: [["number"], "number"],
  FPDF_GetXFAPacketName: [["number", "number", "number", "number"], "number"],
  FPDF_ImportNPagesToOne: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDF_ImportPages: [["number", "number", "string", "number"], "boolean"],
  FPDF_ImportPagesByIndex: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDF_InitLibrary: [[], null],
  FPDF_InitLibraryWithConfig: [["number"], null],
  FPDF_LoadCustomDocument: [["number", "string"], "number"],
  FPDF_LoadDocument: [["number", "string"], "number"],
  FPDF_LoadMemDocument: [["number", "number", "string"], "number"],
  FPDF_LoadMemDocument64: [["number", "number", "string"], "number"],
  FPDF_LoadPage: [["number", "number"], "number"],
  FPDF_LoadXFA: [["number"], "boolean"],
  FPDF_MovePages: [["number", "number", "number", "number"], "boolean"],
  FPDF_NewFormObjectFromXObject: [["number"], "number"],
  FPDF_NewXObjectFromPage: [["number", "number", "number"], "number"],
  FPDF_PageToDevice: [
    [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ],
    "boolean"
  ],
  FPDF_RemoveFormFieldHighlight: [["number"], null],
  FPDF_RenderPage_Close: [["number"], null],
  FPDF_RenderPage_Continue: [["number", "number"], "number"],
  FPDF_RenderPageBitmap: [
    ["number", "number", "number", "number", "number", "number", "number", "number"],
    null
  ],
  FPDF_RenderPageBitmap_Start: [
    [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ],
    "number"
  ],
  FPDF_RenderPageBitmapWithColorScheme_Start: [
    [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number"
    ],
    "number"
  ],
  FPDF_RenderPageBitmapWithMatrix: [
    ["number", "number", "number", "number", "number"],
    null
  ],
  FPDF_SaveAsCopy: [["number", "number", "number"], "boolean"],
  FPDF_SaveWithVersion: [["number", "number", "number", "number"], "boolean"],
  FPDF_SetFormFieldHighlightAlpha: [["number", "number"], null],
  FPDF_SetFormFieldHighlightColor: [["number", "number", "number"], null],
  FPDF_SetSandBoxPolicy: [["number", "boolean"], null],
  FPDF_SetSystemFontInfo: [["number"], null],
  FPDF_StructElement_Attr_CountChildren: [["number"], "number"],
  FPDF_StructElement_Attr_GetBlobValue: [
    ["number", "number", "number", "number"],
    "boolean"
  ],
  FPDF_StructElement_Attr_GetBooleanValue: [["number", "number"], "boolean"],
  FPDF_StructElement_Attr_GetChildAtIndex: [["number", "number"], "number"],
  FPDF_StructElement_Attr_GetCount: [["number"], "number"],
  FPDF_StructElement_Attr_GetName: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDF_StructElement_Attr_GetNumberValue: [["number", "number"], "boolean"],
  FPDF_StructElement_Attr_GetStringValue: [
    ["number", "number", "number", "number"],
    "boolean"
  ],
  FPDF_StructElement_Attr_GetType: [["number"], "number"],
  FPDF_StructElement_Attr_GetValue: [["number", "string"], "number"],
  FPDF_StructElement_CountChildren: [["number"], "number"],
  FPDF_StructElement_GetActualText: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetAltText: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetAttributeAtIndex: [["number", "number"], "number"],
  FPDF_StructElement_GetAttributeCount: [["number"], "number"],
  FPDF_StructElement_GetChildAtIndex: [["number", "number"], "number"],
  FPDF_StructElement_GetChildMarkedContentID: [["number", "number"], "number"],
  FPDF_StructElement_GetID: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetLang: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetMarkedContentID: [["number"], "number"],
  FPDF_StructElement_GetMarkedContentIdAtIndex: [["number", "number"], "number"],
  FPDF_StructElement_GetMarkedContentIdCount: [["number"], "number"],
  FPDF_StructElement_GetObjType: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetParent: [["number"], "number"],
  FPDF_StructElement_GetStringAttribute: [
    ["number", "string", "number", "number"],
    "number"
  ],
  FPDF_StructElement_GetTitle: [["number", "number", "number"], "number"],
  FPDF_StructElement_GetType: [["number", "number", "number"], "number"],
  FPDF_StructTree_Close: [["number"], null],
  FPDF_StructTree_CountChildren: [["number"], "number"],
  FPDF_StructTree_GetChildAtIndex: [["number", "number"], "number"],
  FPDF_StructTree_GetForPage: [["number"], "number"],
  FPDF_VIEWERREF_GetDuplex: [["number"], "number"],
  FPDF_VIEWERREF_GetName: [["number", "string", "number", "number"], "number"],
  FPDF_VIEWERREF_GetNumCopies: [["number"], "number"],
  FPDF_VIEWERREF_GetPrintPageRange: [["number"], "number"],
  FPDF_VIEWERREF_GetPrintPageRangeCount: [["number"], "number"],
  FPDF_VIEWERREF_GetPrintPageRangeElement: [["number", "number"], "number"],
  FPDF_VIEWERREF_GetPrintScaling: [["number"], "boolean"],
  FPDFAction_GetDest: [["number", "number"], "number"],
  FPDFAction_GetFilePath: [["number", "number", "number"], "number"],
  FPDFAction_GetType: [["number"], "number"],
  FPDFAction_GetURIPath: [["number", "number", "number", "number"], "number"],
  FPDFAnnot_AddFileAttachment: [["number", "number"], "number"],
  FPDFAnnot_AddInkStroke: [["number", "number", "number"], "number"],
  FPDFAnnot_AppendAttachmentPoints: [["number", "number"], "boolean"],
  FPDFAnnot_AppendObject: [["number", "number"], "boolean"],
  FPDFAnnot_CountAttachmentPoints: [["number"], "number"],
  FPDFAnnot_GetAP: [["number", "number", "number", "number"], "number"],
  FPDFAnnot_GetAttachmentPoints: [["number", "number", "number"], "boolean"],
  FPDFAnnot_GetBorder: [["number", "number", "number", "number"], "boolean"],
  FPDFAnnot_GetColor: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFAnnot_GetFileAttachment: [["number"], "number"],
  FPDFAnnot_GetFlags: [["number"], "number"],
  FPDFAnnot_GetFocusableSubtypes: [["number", "number", "number"], "boolean"],
  FPDFAnnot_GetFocusableSubtypesCount: [["number"], "number"],
  FPDFAnnot_GetFontColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFAnnot_GetFontSize: [["number", "number", "number"], "boolean"],
  FPDFAnnot_GetFormAdditionalActionJavaScript: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetFormControlCount: [["number", "number"], "number"],
  FPDFAnnot_GetFormControlIndex: [["number", "number"], "number"],
  FPDFAnnot_GetFormFieldAlternateName: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetFormFieldAtPoint: [["number", "number", "number"], "number"],
  FPDFAnnot_GetFormFieldExportValue: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetFormFieldFlags: [["number", "number"], "number"],
  FPDFAnnot_GetFormFieldName: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetFormFieldType: [["number", "number"], "number"],
  FPDFAnnot_GetFormFieldValue: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetInkListCount: [["number"], "number"],
  FPDFAnnot_GetInkListPath: [["number", "number", "number", "number"], "number"],
  FPDFAnnot_GetLine: [["number", "number", "number"], "boolean"],
  FPDFAnnot_GetLink: [["number"], "number"],
  FPDFAnnot_GetLinkedAnnot: [["number", "string"], "number"],
  FPDFAnnot_GetNumberValue: [["number", "string", "number"], "boolean"],
  FPDFAnnot_GetObject: [["number", "number"], "number"],
  FPDFAnnot_GetObjectCount: [["number"], "number"],
  FPDFAnnot_GetOptionCount: [["number", "number"], "number"],
  FPDFAnnot_GetOptionLabel: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFAnnot_GetRect: [["number", "number"], "boolean"],
  FPDFAnnot_GetStringValue: [["number", "string", "number", "number"], "number"],
  FPDFAnnot_GetSubtype: [["number"], "number"],
  FPDFAnnot_GetValueType: [["number", "string"], "number"],
  FPDFAnnot_GetVertices: [["number", "number", "number"], "number"],
  FPDFAnnot_HasAttachmentPoints: [["number"], "boolean"],
  FPDFAnnot_HasKey: [["number", "string"], "boolean"],
  FPDFAnnot_IsChecked: [["number", "number"], "boolean"],
  FPDFAnnot_IsObjectSupportedSubtype: [["number"], "boolean"],
  FPDFAnnot_IsOptionSelected: [["number", "number", "number"], "boolean"],
  FPDFAnnot_IsSupportedSubtype: [["number"], "boolean"],
  FPDFAnnot_RemoveInkList: [["number"], "boolean"],
  FPDFAnnot_RemoveObject: [["number", "number"], "boolean"],
  FPDFAnnot_SetAP: [["number", "number", "number"], "boolean"],
  FPDFAnnot_SetAttachmentPoints: [["number", "number", "number"], "boolean"],
  FPDFAnnot_SetBorder: [["number", "number", "number", "number"], "boolean"],
  FPDFAnnot_SetColor: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFAnnot_SetFlags: [["number", "number"], "boolean"],
  FPDFAnnot_SetFocusableSubtypes: [["number", "number", "number"], "boolean"],
  FPDFAnnot_SetFontColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFAnnot_SetFormFieldFlags: [["number", "number", "number"], "boolean"],
  FPDFAnnot_SetRect: [["number", "number"], "boolean"],
  FPDFAnnot_SetStringValue: [["number", "string", "number"], "boolean"],
  FPDFAnnot_SetURI: [["number", "number"], "boolean"],
  FPDFAnnot_UpdateObject: [["number", "number"], "boolean"],
  FPDFAttachment_GetFile: [["number", "number", "number", "number"], "boolean"],
  FPDFAttachment_GetName: [["number", "number", "number"], "number"],
  FPDFAttachment_GetStringValue: [
    ["number", "string", "number", "number"],
    "number"
  ],
  FPDFAttachment_GetSubtype: [["number", "number", "number"], "number"],
  FPDFAttachment_GetValueType: [["number", "string"], "number"],
  FPDFAttachment_HasKey: [["number", "string"], "boolean"],
  FPDFAttachment_SetFile: [["number", "number", "number", "number"], "boolean"],
  FPDFAttachment_SetStringValue: [["number", "string", "number"], "boolean"],
  FPDFAvail_Create: [["number", "number"], "number"],
  FPDFAvail_Destroy: [["number"], null],
  FPDFAvail_GetDocument: [["number", "string"], "number"],
  FPDFAvail_GetFirstPageNum: [["number"], "number"],
  FPDFAvail_IsDocAvail: [["number", "number"], "number"],
  FPDFAvail_IsFormAvail: [["number", "number"], "number"],
  FPDFAvail_IsLinearized: [["number"], "number"],
  FPDFAvail_IsPageAvail: [["number", "number", "number"], "number"],
  FPDFBitmap_Create: [["number", "number", "number"], "number"],
  FPDFBitmap_CreateEx: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFBitmap_Destroy: [["number"], null],
  FPDFBitmap_FillRect: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFBitmap_GetBuffer: [["number"], "number"],
  FPDFBitmap_GetFormat: [["number"], "number"],
  FPDFBitmap_GetHeight: [["number"], "number"],
  FPDFBitmap_GetStride: [["number"], "number"],
  FPDFBitmap_GetWidth: [["number"], "number"],
  FPDFBookmark_Find: [["number", "number"], "number"],
  FPDFBookmark_GetAction: [["number"], "number"],
  FPDFBookmark_GetCount: [["number"], "number"],
  FPDFBookmark_GetDest: [["number", "number"], "number"],
  FPDFBookmark_GetFirstChild: [["number", "number"], "number"],
  FPDFBookmark_GetNextSibling: [["number", "number"], "number"],
  FPDFBookmark_GetTitle: [["number", "number", "number"], "number"],
  FPDFCatalog_IsTagged: [["number"], "boolean"],
  FPDFCatalog_SetLanguage: [["number", "string"], "boolean"],
  FPDFClipPath_CountPaths: [["number"], "number"],
  FPDFClipPath_CountPathSegments: [["number", "number"], "number"],
  FPDFClipPath_GetPathSegment: [["number", "number", "number"], "number"],
  FPDFDest_GetDestPageIndex: [["number", "number"], "number"],
  FPDFDest_GetLocationInPage: [
    ["number", "number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFDest_GetView: [["number", "number", "number"], "number"],
  FPDFDoc_AddAttachment: [["number", "number"], "number"],
  FPDFDoc_CloseJavaScriptAction: [["number"], null],
  FPDFDoc_DeleteAttachment: [["number", "number"], "boolean"],
  FPDFDOC_ExitFormFillEnvironment: [["number"], null],
  FPDFDoc_GetAttachment: [["number", "number"], "number"],
  FPDFDoc_GetAttachmentCount: [["number"], "number"],
  FPDFDoc_GetJavaScriptAction: [["number", "number"], "number"],
  FPDFDoc_GetJavaScriptActionCount: [["number"], "number"],
  FPDFDoc_GetPageMode: [["number"], "number"],
  FPDFDOC_InitFormFillEnvironment: [["number", "number"], "number"],
  FPDFFont_Close: [["number"], null],
  FPDFFont_GetAscent: [["number", "number", "number"], "boolean"],
  FPDFFont_GetBaseFontName: [["number", "number", "number"], "number"],
  FPDFFont_GetDescent: [["number", "number", "number"], "boolean"],
  FPDFFont_GetFamilyName: [["number", "number", "number"], "number"],
  FPDFFont_GetFlags: [["number"], "number"],
  FPDFFont_GetFontData: [["number", "number", "number", "number"], "boolean"],
  FPDFFont_GetGlyphPath: [["number", "number", "number"], "number"],
  FPDFFont_GetGlyphWidth: [["number", "number", "number", "number"], "boolean"],
  FPDFFont_GetIsEmbedded: [["number"], "number"],
  FPDFFont_GetItalicAngle: [["number", "number"], "boolean"],
  FPDFFont_GetWeight: [["number"], "number"],
  FPDFFormObj_CountObjects: [["number"], "number"],
  FPDFFormObj_GetObject: [["number", "number"], "number"],
  FPDFFormObj_RemoveObject: [["number", "number"], "boolean"],
  FPDFGlyphPath_CountGlyphSegments: [["number"], "number"],
  FPDFGlyphPath_GetGlyphPathSegment: [["number", "number"], "number"],
  FPDFImageObj_GetBitmap: [["number"], "number"],
  FPDFImageObj_GetIccProfileDataDecoded: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFImageObj_GetImageDataDecoded: [["number", "number", "number"], "number"],
  FPDFImageObj_GetImageDataRaw: [["number", "number", "number"], "number"],
  FPDFImageObj_GetImageFilter: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFImageObj_GetImageFilterCount: [["number"], "number"],
  FPDFImageObj_GetImageMetadata: [["number", "number", "number"], "boolean"],
  FPDFImageObj_GetImagePixelSize: [["number", "number", "number"], "boolean"],
  FPDFImageObj_GetRenderedBitmap: [["number", "number", "number"], "number"],
  FPDFImageObj_LoadJpegFile: [
    ["number", "number", "number", "number"],
    "boolean"
  ],
  FPDFImageObj_LoadJpegFileInline: [
    ["number", "number", "number", "number"],
    "boolean"
  ],
  FPDFImageObj_SetBitmap: [["number", "number", "number", "number"], "boolean"],
  FPDFImageObj_SetMatrix: [
    ["number", "number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFJavaScriptAction_GetName: [["number", "number", "number"], "number"],
  FPDFJavaScriptAction_GetScript: [["number", "number", "number"], "number"],
  FPDFLink_CloseWebLinks: [["number"], null],
  FPDFLink_CountQuadPoints: [["number"], "number"],
  FPDFLink_CountRects: [["number", "number"], "number"],
  FPDFLink_CountWebLinks: [["number"], "number"],
  FPDFLink_Enumerate: [["number", "number", "number"], "boolean"],
  FPDFLink_GetAction: [["number"], "number"],
  FPDFLink_GetAnnot: [["number", "number"], "number"],
  FPDFLink_GetAnnotRect: [["number", "number"], "boolean"],
  FPDFLink_GetDest: [["number", "number"], "number"],
  FPDFLink_GetLinkAtPoint: [["number", "number", "number"], "number"],
  FPDFLink_GetLinkZOrderAtPoint: [["number", "number", "number"], "number"],
  FPDFLink_GetQuadPoints: [["number", "number", "number"], "boolean"],
  FPDFLink_GetRect: [
    ["number", "number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFLink_GetTextRange: [["number", "number", "number", "number"], "boolean"],
  FPDFLink_GetURL: [["number", "number", "number", "number"], "number"],
  FPDFLink_LoadWebLinks: [["number"], "number"],
  FPDFPage_CloseAnnot: [["number"], null],
  FPDFPage_CountObjects: [["number"], "number"],
  FPDFPage_CreateAnnot: [["number", "number"], "number"],
  FPDFPage_Delete: [["number", "number"], null],
  FPDFPage_Flatten: [["number", "number"], "number"],
  FPDFPage_FormFieldZOrderAtPoint: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFPage_GenerateContent: [["number"], "boolean"],
  FPDFPage_GetAnnot: [["number", "number"], "number"],
  FPDFPage_GetAnnotCount: [["number"], "number"],
  FPDFPage_GetAnnotIndex: [["number", "number"], "number"],
  FPDFPage_GetArtBox: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPage_GetBleedBox: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPage_GetCropBox: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPage_GetDecodedThumbnailData: [["number", "number", "number"], "number"],
  FPDFPage_GetMediaBox: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPage_GetObject: [["number", "number"], "number"],
  FPDFPage_GetRawThumbnailData: [["number", "number", "number"], "number"],
  FPDFPage_GetRotation: [["number"], "number"],
  FPDFPage_GetThumbnailAsBitmap: [["number"], "number"],
  FPDFPage_GetTrimBox: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPage_HasFormFieldAtPoint: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFPage_HasTransparency: [["number"], "boolean"],
  FPDFPage_InsertClipPath: [["number", "number"], null],
  FPDFPage_InsertObject: [["number", "number"], null],
  FPDFPage_InsertObjectAtIndex: [["number", "number", "number"], "boolean"],
  FPDFPage_New: [["number", "number", "number", "number"], "number"],
  FPDFPage_RemoveAnnot: [["number", "number"], "boolean"],
  FPDFPage_RemoveObject: [["number", "number"], "boolean"],
  FPDFPage_SetArtBox: [["number", "number", "number", "number", "number"], null],
  FPDFPage_SetBleedBox: [
    ["number", "number", "number", "number", "number"],
    null
  ],
  FPDFPage_SetCropBox: [["number", "number", "number", "number", "number"], null],
  FPDFPage_SetMediaBox: [
    ["number", "number", "number", "number", "number"],
    null
  ],
  FPDFPage_SetRotation: [["number", "number"], null],
  FPDFPage_SetTrimBox: [["number", "number", "number", "number", "number"], null],
  FPDFPage_TransformAnnots: [
    ["number", "number", "number", "number", "number", "number", "number"],
    null
  ],
  FPDFPage_TransFormWithClip: [["number", "number", "number"], "boolean"],
  FPDFPageObj_AddMark: [["number", "string"], "number"],
  FPDFPageObj_CountMarks: [["number"], "number"],
  FPDFPageObj_CreateNewPath: [["number", "number"], "number"],
  FPDFPageObj_CreateNewRect: [["number", "number", "number", "number"], "number"],
  FPDFPageObj_CreateTextObj: [["number", "number", "number"], "number"],
  FPDFPageObj_Destroy: [["number"], null],
  FPDFPageObj_GetBounds: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObj_GetClipPath: [["number"], "number"],
  FPDFPageObj_GetDashArray: [["number", "number", "number"], "boolean"],
  FPDFPageObj_GetDashCount: [["number"], "number"],
  FPDFPageObj_GetDashPhase: [["number", "number"], "boolean"],
  FPDFPageObj_GetFillColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObj_GetIsActive: [["number", "number"], "boolean"],
  FPDFPageObj_GetLineCap: [["number"], "number"],
  FPDFPageObj_GetLineJoin: [["number"], "number"],
  FPDFPageObj_GetMark: [["number", "number"], "number"],
  FPDFPageObj_GetMarkedContentID: [["number"], "number"],
  FPDFPageObj_GetMatrix: [["number", "number"], "boolean"],
  FPDFPageObj_GetRotatedBounds: [["number", "number"], "boolean"],
  FPDFPageObj_GetStrokeColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObj_GetStrokeWidth: [["number", "number"], "boolean"],
  FPDFPageObj_GetType: [["number"], "number"],
  FPDFPageObj_HasTransparency: [["number"], "boolean"],
  FPDFPageObj_NewImageObj: [["number"], "number"],
  FPDFPageObj_NewTextObj: [["number", "string", "number"], "number"],
  FPDFPageObj_RemoveMark: [["number", "number"], "boolean"],
  FPDFPageObj_SetBlendMode: [["number", "string"], null],
  FPDFPageObj_SetDashArray: [["number", "number", "number", "number"], "boolean"],
  FPDFPageObj_SetDashPhase: [["number", "number"], "boolean"],
  FPDFPageObj_SetFillColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObj_SetIsActive: [["number", "boolean"], "boolean"],
  FPDFPageObj_SetLineCap: [["number", "number"], "boolean"],
  FPDFPageObj_SetLineJoin: [["number", "number"], "boolean"],
  FPDFPageObj_SetMatrix: [["number", "number"], "boolean"],
  FPDFPageObj_SetStrokeColor: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObj_SetStrokeWidth: [["number", "number"], "boolean"],
  FPDFPageObj_Transform: [
    ["number", "number", "number", "number", "number", "number", "number"],
    null
  ],
  FPDFPageObj_TransformClipPath: [
    ["number", "number", "number", "number", "number", "number", "number"],
    null
  ],
  FPDFPageObj_TransformF: [["number", "number"], "boolean"],
  FPDFPageObjMark_CountParams: [["number"], "number"],
  FPDFPageObjMark_GetName: [["number", "number", "number", "number"], "boolean"],
  FPDFPageObjMark_GetParamBlobValue: [
    ["number", "string", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObjMark_GetParamIntValue: [["number", "string", "number"], "boolean"],
  FPDFPageObjMark_GetParamKey: [
    ["number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObjMark_GetParamStringValue: [
    ["number", "string", "number", "number", "number"],
    "boolean"
  ],
  FPDFPageObjMark_GetParamValueType: [["number", "string"], "number"],
  FPDFPageObjMark_RemoveParam: [["number", "number", "string"], "boolean"],
  FPDFPageObjMark_SetBlobParam: [
    ["number", "number", "number", "string", "number", "number"],
    "boolean"
  ],
  FPDFPageObjMark_SetIntParam: [
    ["number", "number", "number", "string", "number"],
    "boolean"
  ],
  FPDFPageObjMark_SetStringParam: [
    ["number", "number", "number", "string", "string"],
    "boolean"
  ],
  FPDFPath_BezierTo: [
    ["number", "number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFPath_Close: [["number"], "boolean"],
  FPDFPath_CountSegments: [["number"], "number"],
  FPDFPath_GetDrawMode: [["number", "number", "number"], "boolean"],
  FPDFPath_GetPathSegment: [["number", "number"], "number"],
  FPDFPath_LineTo: [["number", "number", "number"], "boolean"],
  FPDFPath_MoveTo: [["number", "number", "number"], "boolean"],
  FPDFPath_SetDrawMode: [["number", "number", "boolean"], "boolean"],
  FPDFPathSegment_GetClose: [["number"], "boolean"],
  FPDFPathSegment_GetPoint: [["number", "number", "number"], "boolean"],
  FPDFPathSegment_GetType: [["number"], "number"],
  FPDFSignatureObj_GetByteRange: [["number", "number", "number"], "number"],
  FPDFSignatureObj_GetContents: [["number", "number", "number"], "number"],
  FPDFSignatureObj_GetDocMDPPermission: [["number"], "number"],
  FPDFSignatureObj_GetReason: [["number", "number", "number"], "number"],
  FPDFSignatureObj_GetSubFilter: [["number", "number", "number"], "number"],
  FPDFSignatureObj_GetTime: [["number", "number", "number"], "number"],
  FPDFText_ClosePage: [["number"], null],
  FPDFText_CountChars: [["number"], "number"],
  FPDFText_CountRects: [["number", "number", "number"], "number"],
  FPDFText_FindClose: [["number"], null],
  FPDFText_FindNext: [["number"], "boolean"],
  FPDFText_FindPrev: [["number"], "boolean"],
  FPDFText_FindStart: [["number", "number", "number", "number"], "number"],
  FPDFText_GetBoundedText: [
    ["number", "number", "number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFText_GetCharAngle: [["number", "number"], "number"],
  FPDFText_GetCharBox: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFText_GetCharIndexAtPos: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFText_GetCharIndexFromTextIndex: [["number", "number"], "number"],
  FPDFText_GetCharOrigin: [["number", "number", "number", "number"], "boolean"],
  FPDFText_GetFillColor: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFText_GetFontInfo: [
    ["number", "number", "number", "number", "number"],
    "number"
  ],
  FPDFText_GetFontSize: [["number", "number"], "number"],
  FPDFText_GetFontWeight: [["number", "number"], "number"],
  FPDFText_GetLooseCharBox: [["number", "number", "number"], "boolean"],
  FPDFText_GetMatrix: [["number", "number", "number"], "boolean"],
  FPDFText_GetRect: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFText_GetSchCount: [["number"], "number"],
  FPDFText_GetSchResultIndex: [["number"], "number"],
  FPDFText_GetStrokeColor: [
    ["number", "number", "number", "number", "number", "number"],
    "boolean"
  ],
  FPDFText_GetText: [["number", "number", "number", "number"], "number"],
  FPDFText_GetTextIndexFromCharIndex: [["number", "number"], "number"],
  FPDFText_GetTextObject: [["number", "number"], "number"],
  FPDFText_GetUnicode: [["number", "number"], "number"],
  FPDFText_HasUnicodeMapError: [["number", "number"], "number"],
  FPDFText_IsGenerated: [["number", "number"], "number"],
  FPDFText_IsHyphen: [["number", "number"], "number"],
  FPDFText_LoadCidType2Font: [
    ["number", "number", "number", "string", "number", "number"],
    "number"
  ],
  FPDFText_LoadFont: [
    ["number", "number", "number", "number", "boolean"],
    "number"
  ],
  FPDFText_LoadPage: [["number"], "number"],
  FPDFText_LoadStandardFont: [["number", "string"], "number"],
  FPDFText_SetCharcodes: [["number", "number", "number"], "boolean"],
  FPDFText_SetText: [["number", "number"], "boolean"],
  FPDFTextObj_GetFont: [["number"], "number"],
  FPDFTextObj_GetFontSize: [["number", "number"], "boolean"],
  FPDFTextObj_GetRenderedBitmap: [
    ["number", "number", "number", "number"],
    "number"
  ],
  FPDFTextObj_GetText: [["number", "number", "number", "number"], "number"],
  FPDFTextObj_GetTextRenderMode: [["number"], "number"],
  FPDFTextObj_SetTextRenderMode: [["number", "number"], "boolean"],
  PDFiumExt_CloseFileWriter: [["number"], null],
  PDFiumExt_CloseFormFillInfo: [["number"], null],
  PDFiumExt_ExitFormFillEnvironment: [["number"], null],
  PDFiumExt_GetFileWriterData: [["number", "number", "number"], "number"],
  PDFiumExt_GetFileWriterSize: [["number"], "number"],
  PDFiumExt_Init: [[], null],
  PDFiumExt_InitFormFillEnvironment: [["number", "number"], "number"],
  PDFiumExt_OpenFileWriter: [[], "number"],
  PDFiumExt_OpenFormFillInfo: [[], "number"],
  PDFiumExt_SaveAsCopy: [["number", "number"], "number"]
};
async function createWrappedModule(pdfium) {
  const module = {
    pdfium
  };
  for (const key in functions) {
    const ident = key;
    const args = functions[ident][0];
    const ret = functions[ident][1];
    module[ident] = pdfium.cwrap(key, ret, args);
  }
  return module;
}
async function init(moduleOverrides) {
  const pdfium = await createPdfium(moduleOverrides);
  return createWrappedModule(pdfium);
}
const LOG_SOURCE$2 = "WebWorkerEngineRunner";
const LOG_CATEGORY$2 = "Engine";
class EngineRunner {
  /**
   * Create instance of EngineRunnder
   * @param logger - logger instance
   */
  constructor(logger = new NoopLogger()) {
    this.logger = logger;
    this.tasks = /* @__PURE__ */ new Map();
    this.lastYield = 0;
    this.cancelledIds = /* @__PURE__ */ new Set();
    this.execute = async (request) => {
      this.logger.debug(LOG_SOURCE$2, LOG_CATEGORY$2, "runner start exeucte request");
      if (!this.engine) {
        const error = {
          type: "reject",
          reason: {
            code: PdfErrorCode.NotReady,
            message: "engine has not started yet"
          }
        };
        const response = {
          id: request.id,
          type: "ExecuteResponse",
          data: {
            type: "error",
            value: error
          }
        };
        this.respond(response);
        return;
      }
      await this.maybeYield();
      if (this.cancelledIds.has(request.id)) {
        this.respond({
          id: request.id,
          type: "ExecuteResponse",
          data: {
            type: "error",
            value: {
              type: "reject",
              reason: { code: PdfErrorCode.Cancelled, message: "aborted by client (pre-cancelled)" }
            }
          }
        });
        return;
      }
      const engine = this.engine;
      const { name, args } = request.data;
      if (!engine[name]) {
        const error = {
          type: "reject",
          reason: {
            code: PdfErrorCode.NotSupport,
            message: \`engine method \${name} is not supported yet\`
          }
        };
        const response = {
          id: request.id,
          type: "ExecuteResponse",
          data: {
            type: "error",
            value: error
          }
        };
        this.respond(response);
        return;
      }
      let task;
      switch (name) {
        case "isSupport":
          task = this.engine[name](...args);
          break;
        case "initialize":
          task = this.engine[name](...args);
          break;
        case "destroy":
          task = this.engine[name](...args);
          break;
        case "openDocumentUrl":
          task = this.engine[name](...args);
          break;
        case "openDocumentBuffer":
          task = this.engine[name](...args);
          break;
        case "getDocPermissions":
          task = this.engine[name](...args);
          break;
        case "getDocUserPermissions":
          task = this.engine[name](...args);
          break;
        case "getMetadata":
          task = this.engine[name](...args);
          break;
        case "setMetadata":
          task = this.engine[name](...args);
          break;
        case "getBookmarks":
          task = this.engine[name](...args);
          break;
        case "setBookmarks":
          task = this.engine[name](...args);
          break;
        case "deleteBookmarks":
          task = this.engine[name](...args);
          break;
        case "getSignatures":
          task = this.engine[name](...args);
          break;
        case "renderPage":
          task = this.engine[name](...args);
          break;
        case "renderPageRect":
          task = this.engine[name](...args);
          break;
        case "renderPageAnnotation":
          task = this.engine[name](...args);
          break;
        case "renderThumbnail":
          task = this.engine[name](...args);
          break;
        case "getAllAnnotations":
          task = this.engine[name](...args);
          break;
        case "getPageAnnotations":
          task = this.engine[name](...args);
          break;
        case "createPageAnnotation":
          task = this.engine[name](...args);
          break;
        case "updatePageAnnotation":
          task = this.engine[name](...args);
          break;
        case "removePageAnnotation":
          task = this.engine[name](...args);
          break;
        case "getPageTextRects":
          task = this.engine[name](...args);
          break;
        case "searchAllPages":
          task = this.engine[name](...args);
          break;
        case "closeDocument":
          task = this.engine[name](...args);
          break;
        case "closeAllDocuments":
          task = this.engine[name](...args);
          break;
        case "saveAsCopy":
          task = this.engine[name](...args);
          break;
        case "getAttachments":
          task = this.engine[name](...args);
          break;
        case "addAttachment":
          task = this.engine[name](...args);
          break;
        case "removeAttachment":
          task = this.engine[name](...args);
          break;
        case "readAttachmentContent":
          task = this.engine[name](...args);
          break;
        case "setFormFieldValue":
          task = this.engine[name](...args);
          break;
        case "flattenPage":
          task = this.engine[name](...args);
          break;
        case "extractPages":
          task = this.engine[name](...args);
          break;
        case "extractText":
          task = this.engine[name](...args);
          break;
        case "redactTextInRects":
          task = this.engine[name](...args);
          break;
        case "getTextSlices":
          task = this.engine[name](...args);
          break;
        case "getPageGlyphs":
          task = this.engine[name](...args);
          break;
        case "getPageGeometry":
          task = this.engine[name](...args);
          break;
        case "merge":
          task = this.engine[name](...args);
          break;
        case "mergePages":
          task = this.engine[name](...args);
          break;
        case "preparePrintDocument":
          task = this.engine[name](...args);
          break;
      }
      this.tasks.set(request.id, task);
      task.onProgress((progress) => {
        const response = {
          id: request.id,
          type: "ExecuteProgress",
          data: progress
        };
        this.respond(response);
      });
      task.wait(
        (result) => {
          const response = {
            id: request.id,
            type: "ExecuteResponse",
            data: {
              type: "result",
              value: result
            }
          };
          this.respond(response);
          this.tasks.delete(request.id);
          this.cancelledIds.delete(request.id);
        },
        (error) => {
          const response = {
            id: request.id,
            type: "ExecuteResponse",
            data: {
              type: "error",
              value: error
            }
          };
          this.respond(response);
          this.tasks.delete(request.id);
          this.cancelledIds.delete(request.id);
        }
      );
    };
  }
  /**
   * Listening on post message
   */
  listen() {
    self.onmessage = (evt) => {
      return this.handle(evt);
    };
  }
  /**
   * Handle post message
   */
  handle(evt) {
    this.logger.debug(LOG_SOURCE$2, LOG_CATEGORY$2, "webworker receive message event: ", evt.data);
    try {
      const request = evt.data;
      switch (request.type) {
        case "ExecuteRequest":
          this.execute(request);
          break;
        case "AbortRequest":
          this.abort(request);
          break;
      }
    } catch (e) {
      this.logger.info(
        LOG_SOURCE$2,
        LOG_CATEGORY$2,
        "webworker met error when processing message event:",
        e
      );
    }
  }
  /**
   * Send the ready response when pdf engine is ready
   * @returns
   *
   * @protected
   */
  ready() {
    this.listen();
    this.respond({
      id: "0",
      type: "ReadyResponse"
    });
    this.logger.debug(LOG_SOURCE$2, LOG_CATEGORY$2, "runner is ready");
  }
  abort(request) {
    const t = this.tasks.get(request.id);
    this.cancelledIds.add(request.id);
    if (!t) {
      return;
    }
    t.abort({
      code: PdfErrorCode.Cancelled,
      message: "aborted by client"
    });
    this.tasks.delete(request.id);
  }
  async maybeYield() {
    const now = performance.now();
    if (now - this.lastYield > 8) {
      await new Promise((r) => setTimeout(r, 0));
      this.lastYield = performance.now();
    }
  }
  /**
   * Send back the response
   * @param response - response that needs sent back
   *
   * @protected
   */
  respond(response) {
    this.logger.debug(LOG_SOURCE$2, LOG_CATEGORY$2, "runner respond: ", response);
    self.postMessage(response);
  }
}
function readString(wasmModule, readChars, parseChars, defaultLength = 100) {
  let buffer = wasmModule.wasmExports.malloc(defaultLength);
  for (let i = 0; i < defaultLength; i++) {
    wasmModule.HEAP8[buffer + i] = 0;
  }
  const actualLength = readChars(buffer, defaultLength);
  let str;
  if (actualLength > defaultLength) {
    wasmModule.wasmExports.free(buffer);
    buffer = wasmModule.wasmExports.malloc(actualLength);
    for (let i = 0; i < actualLength; i++) {
      wasmModule.HEAP8[buffer + i] = 0;
    }
    readChars(buffer, actualLength);
    str = parseChars(buffer);
  } else {
    str = parseChars(buffer);
  }
  wasmModule.wasmExports.free(buffer);
  return str;
}
function readArrayBuffer(wasmModule, readChars) {
  const bufferSize = readChars(0, 0);
  const bufferPtr = wasmModule.wasmExports.malloc(bufferSize);
  readChars(bufferPtr, bufferSize);
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  for (let i = 0; i < bufferSize; i++) {
    view.setInt8(i, wasmModule.getValue(bufferPtr + i, "i8"));
  }
  wasmModule.wasmExports.free(bufferPtr);
  return arrayBuffer;
}
const RESERVED_INFO_KEYS = /* @__PURE__ */ new Set([
  "Title",
  "Author",
  "Subject",
  "Keywords",
  "Producer",
  "Creator",
  "CreationDate",
  "ModDate",
  "Trapped"
]);
function isValidCustomKey(key) {
  if (!key || key.length > 127) return false;
  if (RESERVED_INFO_KEYS.has(key)) return false;
  if (key[0] === "/") return false;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}
const DEFAULT_CONFIG = {
  pageTtl: 5e3,
  // 5 seconds
  maxPagesPerDocument: 10
};
class PdfCache {
  constructor(pdfium, config = {}) {
    this.pdfium = pdfium;
    this.docs = /* @__PURE__ */ new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /** Open (or re-use) a document */
  setDocument(id, filePtr, docPtr) {
    let ctx = this.docs.get(id);
    if (!ctx) {
      ctx = new DocumentContext(filePtr, docPtr, this.pdfium, this.config);
      this.docs.set(id, ctx);
    }
  }
  /** Retrieve the DocumentContext for a given PdfDocumentObject */
  getContext(docId) {
    return this.docs.get(docId);
  }
  /** Close & fully release a document and all its pages */
  closeDocument(docId) {
    const ctx = this.docs.get(docId);
    if (!ctx) return false;
    ctx.dispose();
    this.docs.delete(docId);
    return true;
  }
  /** Close all documents */
  closeAllDocuments() {
    for (const ctx of this.docs.values()) {
      ctx.dispose();
    }
    this.docs.clear();
  }
  /** Update cache configuration for all existing documents */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    for (const ctx of this.docs.values()) {
      ctx.updateConfig(this.config);
    }
  }
  /** Get current cache statistics */
  getCacheStats() {
    const pagesByDocument = {};
    let totalPages = 0;
    for (const [docId, ctx] of this.docs.entries()) {
      const pageCount = ctx.getCacheSize();
      pagesByDocument[docId] = pageCount;
      totalPages += pageCount;
    }
    return {
      documents: this.docs.size,
      totalPages,
      pagesByDocument
    };
  }
}
class DocumentContext {
  constructor(filePtr, docPtr, pdfium, config) {
    this.filePtr = filePtr;
    this.docPtr = docPtr;
    this.pageCache = new PageCache(pdfium, docPtr, config);
  }
  /** Main accessor for pages */
  acquirePage(pageIdx) {
    return this.pageCache.acquire(pageIdx);
  }
  /** Scoped accessor for one-off / bulk operations */
  borrowPage(pageIdx, fn) {
    return this.pageCache.borrowPage(pageIdx, fn);
  }
  /** Update cache configuration */
  updateConfig(config) {
    this.pageCache.updateConfig(config);
  }
  /** Get number of pages currently in cache */
  getCacheSize() {
    return this.pageCache.size();
  }
  /** Tear down all pages + this document */
  dispose() {
    this.pageCache.forceReleaseAll();
    this.pageCache.pdf.FPDF_CloseDocument(this.docPtr);
    this.pageCache.pdf.pdfium.wasmExports.free(this.filePtr);
  }
}
class PageCache {
  constructor(pdf, docPtr, config) {
    this.pdf = pdf;
    this.docPtr = docPtr;
    this.cache = /* @__PURE__ */ new Map();
    this.accessOrder = [];
    this.config = config;
  }
  acquire(pageIdx) {
    let ctx = this.cache.get(pageIdx);
    if (!ctx) {
      this.evictIfNeeded();
      const pagePtr = this.pdf.FPDF_LoadPage(this.docPtr, pageIdx);
      ctx = new PageContext(this.pdf, this.docPtr, pageIdx, pagePtr, this.config.pageTtl, () => {
        this.cache.delete(pageIdx);
        this.removeFromAccessOrder(pageIdx);
      });
      this.cache.set(pageIdx, ctx);
    }
    this.updateAccessOrder(pageIdx);
    ctx.clearExpiryTimer();
    ctx.bumpRefCount();
    return ctx;
  }
  /** Helper: run a function "scoped" to a page.
   *    – if the page was already cached  → .release() (keeps TTL logic)
   *    – if the page was loaded just now → .disposeImmediate() (free right away)
   */
  borrowPage(pageIdx, fn) {
    const existed = this.cache.has(pageIdx);
    const ctx = this.acquire(pageIdx);
    try {
      return fn(ctx);
    } finally {
      existed ? ctx.release() : ctx.disposeImmediate();
    }
  }
  forceReleaseAll() {
    for (const ctx of this.cache.values()) {
      ctx.disposeImmediate();
    }
    this.cache.clear();
    this.accessOrder.length = 0;
  }
  /** Update cache configuration */
  updateConfig(config) {
    this.config = config;
    for (const ctx of this.cache.values()) {
      ctx.updateTtl(config.pageTtl);
    }
    this.evictIfNeeded();
  }
  /** Get current cache size */
  size() {
    return this.cache.size;
  }
  /** Evict least recently used pages if cache exceeds max size */
  evictIfNeeded() {
    while (this.cache.size >= this.config.maxPagesPerDocument) {
      const lruPageIdx = this.accessOrder[0];
      if (lruPageIdx !== void 0) {
        const ctx = this.cache.get(lruPageIdx);
        if (ctx) {
          if (ctx.getRefCount() === 0) {
            ctx.disposeImmediate();
          } else {
            break;
          }
        } else {
          this.removeFromAccessOrder(lruPageIdx);
        }
      } else {
        break;
      }
    }
  }
  /** Update the access order for LRU tracking */
  updateAccessOrder(pageIdx) {
    this.removeFromAccessOrder(pageIdx);
    this.accessOrder.push(pageIdx);
  }
  /** Remove a page from the access order array */
  removeFromAccessOrder(pageIdx) {
    const index = this.accessOrder.indexOf(pageIdx);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}
class PageContext {
  constructor(pdf, docPtr, pageIdx, pagePtr, ttl, onFinalDispose) {
    this.pdf = pdf;
    this.docPtr = docPtr;
    this.pageIdx = pageIdx;
    this.pagePtr = pagePtr;
    this.onFinalDispose = onFinalDispose;
    this.refCount = 0;
    this.disposed = false;
    this.ttl = ttl;
  }
  /** Called by PageCache.acquire() */
  bumpRefCount() {
    if (this.disposed) throw new Error("Context already disposed");
    this.refCount++;
  }
  /** Get current reference count */
  getRefCount() {
    return this.refCount;
  }
  /** Called by PageCache.acquire() */
  clearExpiryTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = void 0;
    }
  }
  /** Update TTL configuration */
  updateTtl(newTtl) {
    this.ttl = newTtl;
    if (this.expiryTimer && this.refCount === 0) {
      this.clearExpiryTimer();
      this.expiryTimer = setTimeout(() => this.disposeImmediate(), this.ttl);
    }
  }
  /** Called by PageCache.release() internally */
  release() {
    if (this.disposed) return;
    this.refCount--;
    if (this.refCount === 0) {
      this.expiryTimer = setTimeout(() => this.disposeImmediate(), this.ttl);
    }
  }
  /** Tear down _all_ sub-pointers & the page. */
  disposeImmediate() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearExpiryTimer();
    if (this.textPagePtr !== void 0) {
      this.pdf.FPDFText_ClosePage(this.textPagePtr);
    }
    if (this.formHandle !== void 0) {
      this.pdf.FORM_OnBeforeClosePage(this.pagePtr, this.formHandle);
      this.pdf.PDFiumExt_ExitFormFillEnvironment(this.formHandle);
    }
    if (this.formInfoPtr !== void 0) {
      this.pdf.PDFiumExt_CloseFormFillInfo(this.formInfoPtr);
    }
    this.pdf.FPDF_ClosePage(this.pagePtr);
    this.onFinalDispose();
  }
  // ── public helpers ──
  /** Always safe: opens (once) and returns the text-page ptr. */
  getTextPage() {
    this.ensureAlive();
    if (this.textPagePtr === void 0) {
      this.textPagePtr = this.pdf.FPDFText_LoadPage(this.pagePtr);
    }
    return this.textPagePtr;
  }
  /** Always safe: opens (once) and returns the form-fill handle. */
  getFormHandle() {
    this.ensureAlive();
    if (this.formHandle === void 0) {
      this.formInfoPtr = this.pdf.PDFiumExt_OpenFormFillInfo();
      this.formHandle = this.pdf.PDFiumExt_InitFormFillEnvironment(this.docPtr, this.formInfoPtr);
      this.pdf.FORM_OnAfterLoadPage(this.pagePtr, this.formHandle);
    }
    return this.formHandle;
  }
  /**
   * Safely execute \`fn\` with an annotation pointer.
   * Pointer is ALWAYS closed afterwards.
   */
  withAnnotation(annotIdx, fn) {
    this.ensureAlive();
    const annotPtr = this.pdf.FPDFPage_GetAnnot(this.pagePtr, annotIdx);
    try {
      return fn(annotPtr);
    } finally {
      this.pdf.FPDFPage_CloseAnnot(annotPtr);
    }
  }
  ensureAlive() {
    if (this.disposed) throw new Error("PageContext already disposed");
  }
}
const WasmPointer = (ptr) => ptr;
const MEMORY_LIMITS = {
  /** Maximum total memory that can be allocated (2GB) */
  MAX_TOTAL_MEMORY: 2 * 1024 * 1024 * 1024
};
const LIMITS = {
  MEMORY: MEMORY_LIMITS
};
const LOG_SOURCE$1 = "PDFiumEngine";
const LOG_CATEGORY$1 = "MemoryManager";
class MemoryManager {
  constructor(pdfiumModule, logger) {
    this.pdfiumModule = pdfiumModule;
    this.logger = logger;
    this.allocations = /* @__PURE__ */ new Map();
    this.totalAllocated = 0;
  }
  /**
   * Allocate memory with tracking and validation
   */
  malloc(size) {
    if (this.totalAllocated + size > LIMITS.MEMORY.MAX_TOTAL_MEMORY) {
      throw new Error(
        \`Total memory usage would exceed limit: \${this.totalAllocated + size} > \${LIMITS.MEMORY.MAX_TOTAL_MEMORY}\`
      );
    }
    const ptr = this.pdfiumModule.pdfium.wasmExports.malloc(size);
    if (!ptr) {
      throw new Error(\`Failed to allocate \${size} bytes\`);
    }
    const allocation = {
      ptr: WasmPointer(ptr),
      size,
      timestamp: Date.now(),
      stack: this.logger.isEnabled("debug") ? new Error().stack : void 0
    };
    this.allocations.set(ptr, allocation);
    this.totalAllocated += size;
    return WasmPointer(ptr);
  }
  /**
   * Free memory with validation
   */
  free(ptr) {
    const allocation = this.allocations.get(ptr);
    if (!allocation) {
      this.logger.warn(LOG_SOURCE$1, LOG_CATEGORY$1, \`Freeing untracked pointer: \${ptr}\`);
    } else {
      this.totalAllocated -= allocation.size;
      this.allocations.delete(ptr);
    }
    this.pdfiumModule.pdfium.wasmExports.free(ptr);
  }
  /**
   * Get memory statistics
   */
  getStats() {
    return {
      totalAllocated: this.totalAllocated,
      allocationCount: this.allocations.size,
      allocations: this.logger.isEnabled("debug") ? Array.from(this.allocations.values()) : []
    };
  }
  /**
   * Check for memory leaks
   */
  checkLeaks() {
    if (this.allocations.size > 0) {
      this.logger.warn(
        LOG_SOURCE$1,
        LOG_CATEGORY$1,
        \`Potential memory leak: \${this.allocations.size} unfreed allocations\`
      );
      for (const [ptr, alloc] of this.allocations) {
        this.logger.warn(LOG_SOURCE$1, LOG_CATEGORY$1, \`  - \${ptr}: \${alloc.size} bytes\`, alloc.stack);
      }
    }
  }
}
const LOG_SOURCE = "PDFiumEngine";
const LOG_CATEGORY = "Engine";
class OffscreenCanvasError extends Error {
  constructor(message) {
    super(message);
    this.name = "OffscreenCanvasError";
  }
}
const browserImageDataToBlobConverter = (getImageData, imageType = "image/webp", quality) => {
  if (typeof OffscreenCanvas === "undefined") {
    return Promise.reject(
      new OffscreenCanvasError(
        "OffscreenCanvas is not available in this environment. This converter is intended for browser use only. Falling back to WASM-based image encoding."
      )
    );
  }
  const pdfImage = getImageData();
  const imageData = new ImageData(pdfImage.data, pdfImage.width, pdfImage.height);
  const off = new OffscreenCanvas(imageData.width, imageData.height);
  off.getContext("2d").putImageData(imageData, 0, 0);
  return off.convertToBlob({ type: imageType, quality });
};
class PdfiumEngine {
  /**
   * Create an instance of PdfiumEngine
   * @param wasmModule - pdfium wasm module
   * @param logger - logger instance
   * @param imageDataToBlobConverter - function to convert ImageData to Blob
   */
  constructor(pdfiumModule, options = {}) {
    this.pdfiumModule = pdfiumModule;
    this.memoryLeakCheckInterval = null;
    const {
      logger = new NoopLogger(),
      imageDataConverter = browserImageDataToBlobConverter
    } = options;
    this.cache = new PdfCache(this.pdfiumModule);
    this.logger = logger;
    this.imageDataConverter = imageDataConverter;
    this.memoryManager = new MemoryManager(this.pdfiumModule, this.logger);
    if (this.logger.isEnabled("debug")) {
      this.memoryLeakCheckInterval = setInterval(() => {
        this.memoryManager.checkLeaks();
      }, 1e4);
    }
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.initialize}
   *
   * @public
   */
  initialize() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "initialize");
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Initialize\`, "Begin", "General");
    this.pdfiumModule.PDFiumExt_Init();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Initialize\`, "End", "General");
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.destroy}
   *
   * @public
   */
  destroy() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "destroy");
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Destroy\`, "Begin", "General");
    this.pdfiumModule.FPDF_DestroyLibrary();
    if (this.memoryLeakCheckInterval) {
      clearInterval(this.memoryLeakCheckInterval);
      this.memoryLeakCheckInterval = null;
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Destroy\`, "End", "General");
    return PdfTaskHelper.resolve(true);
  }
  /** Write a UTF-16LE (WIDESTRING) to wasm, call \`fn(ptr)\`, then free. */
  withWString(value, fn) {
    const length = (value.length + 1) * 2;
    const ptr = this.memoryManager.malloc(length);
    try {
      this.pdfiumModule.pdfium.stringToUTF16(value, ptr, length);
      return fn(ptr);
    } finally {
      this.memoryManager.free(ptr);
    }
  }
  /** Write a float[] to wasm, call \`fn(ptr, count)\`, then free. */
  withFloatArray(values, fn) {
    const arr = values ?? [];
    const bytes = arr.length * 4;
    const ptr = bytes ? this.memoryManager.malloc(bytes) : WasmPointer(0);
    try {
      if (bytes) {
        for (let i = 0; i < arr.length; i++) {
          this.pdfiumModule.pdfium.setValue(ptr + i * 4, arr[i], "float");
        }
      }
      return fn(ptr, arr.length);
    } finally {
      if (bytes) this.memoryManager.free(ptr);
    }
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocumentUrl}
   *
   * @public
   */
  openDocumentUrl(file, options) {
    const mode = (options == null ? void 0 : options.mode) ?? "auto";
    const password = (options == null ? void 0 : options.password) ?? "";
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "openDocumentUrl called", file.url, mode);
    const task = PdfTaskHelper.create();
    (async () => {
      try {
        const fetchFullTask = await this.fetchFullAndOpen(file, password);
        fetchFullTask.wait(
          (doc) => task.resolve(doc),
          (err) => task.reject(err.reason)
        );
      } catch (err) {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, "openDocumentUrl error", err);
        task.reject({
          code: PdfErrorCode.Unknown,
          message: String(err)
        });
      }
    })();
    return task;
  }
  /**
   * Check if the server supports range requests:
   * Sends a HEAD request and sees if 'Accept-Ranges: bytes'.
   */
  async checkRangeSupport(url) {
    try {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "checkRangeSupport", url);
      const headResponse = await fetch(url, { method: "HEAD" });
      const fileLength = headResponse.headers.get("Content-Length");
      const acceptRanges = headResponse.headers.get("Accept-Ranges");
      if (acceptRanges === "bytes") {
        return {
          supportsRanges: true,
          fileLength: parseInt(fileLength ?? "0"),
          content: null
        };
      }
      const testResponse = await fetch(url, {
        headers: { Range: "bytes=0-1" }
      });
      if (testResponse.status === 200) {
        const content = await testResponse.arrayBuffer();
        return {
          supportsRanges: false,
          fileLength: parseInt(fileLength ?? "0"),
          content
        };
      }
      return {
        supportsRanges: testResponse.status === 206,
        fileLength: parseInt(fileLength ?? "0"),
        content: null
      };
    } catch (e) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, "checkRangeSupport failed", e);
      throw new Error("Failed to check range support: " + e);
    }
  }
  /**
   * Fully fetch the file (using fetch) into an ArrayBuffer,
   * then call openDocumentFromBuffer.
   */
  async fetchFullAndOpen(file, password) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "fetchFullAndOpen", file.url);
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(\`Could not fetch PDF: \${response.statusText}\`);
    }
    const arrayBuf = await response.arrayBuffer();
    const pdfFile = {
      id: file.id,
      name: file.name,
      content: arrayBuf
    };
    return this.openDocumentBuffer(pdfFile, { password });
  }
  /**
   * Use your synchronous partial-loading approach:
   * - In your snippet, it's done via \`openDocumentFromLoader\`.
   * - We'll do a synchronous XHR read callback that pulls
   *   the desired byte ranges.
   */
  async openDocumentWithRangeRequest(file, password, knownFileLength) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "openDocumentWithRangeRequest", file.url);
    const fileLength = knownFileLength ?? (await this.retrieveFileLength(file.url)).fileLength;
    const callback = (offset, length) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", file.url, false);
      xhr.overrideMimeType("text/plain; charset=x-user-defined");
      xhr.setRequestHeader("Range", \`bytes=\${offset}-\${offset + length - 1}\`);
      xhr.send(null);
      if (xhr.status === 206 || xhr.status === 200) {
        return this.convertResponseToUint8Array(xhr.responseText);
      }
      throw new Error(\`Range request failed with status \${xhr.status}\`);
    };
    return this.openDocumentFromLoader(
      {
        id: file.id,
        fileLength,
        callback
      },
      password
    );
  }
  /**
   * Helper to do a HEAD request or partial GET to find file length.
   */
  async retrieveFileLength(url) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "retrieveFileLength", url);
    const resp = await fetch(url, { method: "HEAD" });
    if (!resp.ok) {
      throw new Error(\`Failed HEAD request for file length: \${resp.statusText}\`);
    }
    const lenStr = resp.headers.get("Content-Length") || "0";
    const fileLength = parseInt(lenStr, 10) || 0;
    if (!fileLength) {
      throw new Error(\`Content-Length not found or zero.\`);
    }
    return { fileLength };
  }
  /**
   * Convert response text (x-user-defined) to a Uint8Array
   * for partial data.
   */
  convertResponseToUint8Array(text) {
    const array = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      array[i] = text.charCodeAt(i) & 255;
    }
    return array;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocument}
   *
   * @public
   */
  openDocumentBuffer(file, options) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "openDocumentBuffer", file, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentBuffer\`, "Begin", file.id);
    const array = new Uint8Array(file.content);
    const length = array.length;
    const filePtr = this.memoryManager.malloc(length);
    this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);
    const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, (options == null ? void 0 : options.password) ?? "");
    if (!docPtr) {
      const lastError = this.pdfiumModule.FPDF_GetLastError();
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, \`FPDF_LoadMemDocument failed with \${lastError}\`);
      this.memoryManager.free(filePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentBuffer\`, "End", file.id);
      return PdfTaskHelper.reject({
        code: lastError,
        message: \`FPDF_LoadMemDocument failed\`
      });
    }
    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);
    const pages = [];
    const sizePtr = this.memoryManager.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          \`FPDF_GetPageSizeByIndexF failed with \${lastError}\`
        );
        this.memoryManager.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.memoryManager.free(filePtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentBuffer\`, "End", file.id);
        return PdfTaskHelper.reject({
          code: lastError,
          message: \`FPDF_GetPageSizeByIndexF failed\`
        });
      }
      const rotation = this.pdfiumModule.EPDF_GetPageRotationByIndex(docPtr, index);
      const page = {
        index,
        size: {
          width: this.pdfiumModule.pdfium.getValue(sizePtr, "float"),
          height: this.pdfiumModule.pdfium.getValue(sizePtr + 4, "float")
        },
        rotation
      };
      pages.push(page);
    }
    this.memoryManager.free(sizePtr);
    const pdfDoc = {
      id: file.id,
      name: file.name,
      pageCount,
      pages
    };
    this.cache.setDocument(file.id, filePtr, docPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentBuffer\`, "End", file.id);
    return PdfTaskHelper.resolve(pdfDoc);
  }
  openDocumentFromLoader(fileLoader, password = "") {
    const { fileLength, callback, ...file } = fileLoader;
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "openDocumentFromLoader", file, password);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentFromLoader\`, "Begin", file.id);
    const readBlock = (_pThis, offset, pBuf, length) => {
      try {
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "readBlock", offset, length, pBuf);
        if (offset < 0 || offset >= fileLength) {
          this.logger.error(LOG_SOURCE, LOG_CATEGORY, "Offset out of bounds:", offset);
          return 0;
        }
        const data = callback(offset, length);
        const dest = new Uint8Array(this.pdfiumModule.pdfium.HEAPU8.buffer, pBuf, data.length);
        dest.set(data);
        return data.length;
      } catch (error) {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, "ReadBlock error:", error);
        return 0;
      }
    };
    const callbackPtr = this.pdfiumModule.pdfium.addFunction(readBlock, "iiiii");
    const structSize = 12;
    const fileAccessPtr = this.memoryManager.malloc(structSize);
    this.pdfiumModule.pdfium.setValue(fileAccessPtr, fileLength, "i32");
    this.pdfiumModule.pdfium.setValue(fileAccessPtr + 4, callbackPtr, "i32");
    this.pdfiumModule.pdfium.setValue(fileAccessPtr + 8, 0, "i32");
    const docPtr = this.pdfiumModule.FPDF_LoadCustomDocument(fileAccessPtr, password);
    if (!docPtr) {
      const lastError = this.pdfiumModule.FPDF_GetLastError();
      this.logger.error(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`FPDF_LoadCustomDocument failed with \${lastError}\`
      );
      this.memoryManager.free(fileAccessPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentFromLoader\`, "End", file.id);
      return PdfTaskHelper.reject({
        code: lastError,
        message: \`FPDF_LoadCustomDocument failed\`
      });
    }
    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);
    const pages = [];
    const sizePtr = this.memoryManager.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          \`FPDF_GetPageSizeByIndexF failed with \${lastError}\`
        );
        this.memoryManager.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.memoryManager.free(fileAccessPtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentFromLoader\`, "End", file.id);
        return PdfTaskHelper.reject({
          code: lastError,
          message: \`FPDF_GetPageSizeByIndexF failed\`
        });
      }
      const rotation = this.pdfiumModule.EPDF_GetPageRotationByIndex(docPtr, index);
      const page = {
        index,
        size: {
          width: this.pdfiumModule.pdfium.getValue(sizePtr, "float"),
          height: this.pdfiumModule.pdfium.getValue(sizePtr + 4, "float")
        },
        rotation
      };
      pages.push(page);
    }
    this.memoryManager.free(sizePtr);
    const pdfDoc = {
      id: file.id,
      name: file.name,
      pageCount,
      pages
    };
    this.cache.setDocument(file.id, fileAccessPtr, docPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`OpenDocumentFromLoader\`, "End", file.id);
    return PdfTaskHelper.resolve(pdfDoc);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getMetadata}
   *
   * @public
   */
  getMetadata(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getMetadata", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetMetadata\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetMetadata\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const creationRaw = this.readMetaText(ctx.docPtr, "CreationDate");
    const modRaw = this.readMetaText(ctx.docPtr, "ModDate");
    const metadata = {
      title: this.readMetaText(ctx.docPtr, "Title"),
      author: this.readMetaText(ctx.docPtr, "Author"),
      subject: this.readMetaText(ctx.docPtr, "Subject"),
      keywords: this.readMetaText(ctx.docPtr, "Keywords"),
      producer: this.readMetaText(ctx.docPtr, "Producer"),
      creator: this.readMetaText(ctx.docPtr, "Creator"),
      creationDate: creationRaw ? pdfDateToDate(creationRaw) ?? null : null,
      modificationDate: modRaw ? pdfDateToDate(modRaw) ?? null : null,
      trapped: this.getMetaTrapped(ctx.docPtr),
      custom: this.readAllMeta(ctx.docPtr, true)
    };
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetMetadata\`, "End", doc.id);
    return PdfTaskHelper.resolve(metadata);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setMetadata}
   *
   * @public
   */
  setMetadata(doc, meta) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "setMetadata", doc, meta);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SetMetadata", "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SetMetadata", "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const strMap = [
      ["title", "Title"],
      ["author", "Author"],
      ["subject", "Subject"],
      ["keywords", "Keywords"],
      ["producer", "Producer"],
      ["creator", "Creator"]
    ];
    let ok = true;
    for (const [field, key] of strMap) {
      const v = meta[field];
      if (v === void 0) continue;
      const s = v === null ? null : v;
      if (!this.setMetaText(ctx.docPtr, key, s)) ok = false;
    }
    const writeDate = (field, key) => {
      const v = meta[field];
      if (v === void 0) return;
      if (v === null) {
        if (!this.setMetaText(ctx.docPtr, key, null)) ok = false;
        return;
      }
      const d = v;
      const raw = dateToPdfDate(d);
      if (!this.setMetaText(ctx.docPtr, key, raw)) ok = false;
    };
    writeDate("creationDate", "CreationDate");
    writeDate("modificationDate", "ModDate");
    if (meta.trapped !== void 0) {
      if (!this.setMetaTrapped(ctx.docPtr, meta.trapped ?? null)) ok = false;
    }
    if (meta.custom !== void 0) {
      for (const [key, value] of Object.entries(meta.custom)) {
        if (!isValidCustomKey(key)) {
          this.logger.warn(LOG_SOURCE, LOG_CATEGORY, "Invalid custom metadata key skipped", key);
          continue;
        }
        if (!this.setMetaText(ctx.docPtr, key, value ?? null)) ok = false;
      }
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SetMetadata", "End", doc.id);
    return ok ? PdfTaskHelper.resolve(true) : PdfTaskHelper.reject({
      code: PdfErrorCode.Unknown,
      message: "one or more metadata fields could not be written"
    });
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocPermissions}
   *
   * @public
   */
  getDocPermissions(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getDocPermissions", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`getDocPermissions\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`getDocPermissions\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const permissions = this.pdfiumModule.FPDF_GetDocPermissions(ctx.docPtr);
    return PdfTaskHelper.resolve(permissions);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocUserPermissions}
   *
   * @public
   */
  getDocUserPermissions(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getDocUserPermissions", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`getDocUserPermissions\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`getDocUserPermissions\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const permissions = this.pdfiumModule.FPDF_GetDocUserPermissions(ctx.docPtr);
    return PdfTaskHelper.resolve(permissions);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getSignatures}
   *
   * @public
   */
  getSignatures(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getSignatures", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetSignatures\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetSignatures\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const signatures = [];
    const count = this.pdfiumModule.FPDF_GetSignatureCount(ctx.docPtr);
    for (let i = 0; i < count; i++) {
      const signatureObjPtr = this.pdfiumModule.FPDF_GetSignatureObject(ctx.docPtr, i);
      const contents = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return this.pdfiumModule.FPDFSignatureObj_GetContents(signatureObjPtr, buffer, bufferSize);
      });
      const byteRange = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return this.pdfiumModule.FPDFSignatureObj_GetByteRange(signatureObjPtr, buffer, bufferSize) * 4;
      });
      const subFilter = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return this.pdfiumModule.FPDFSignatureObj_GetSubFilter(signatureObjPtr, buffer, bufferSize);
      });
      const reason = readString(
        this.pdfiumModule.pdfium,
        (buffer, bufferLength) => {
          return this.pdfiumModule.FPDFSignatureObj_GetReason(
            signatureObjPtr,
            buffer,
            bufferLength
          );
        },
        this.pdfiumModule.pdfium.UTF16ToString
      );
      const time = readString(
        this.pdfiumModule.pdfium,
        (buffer, bufferLength) => {
          return this.pdfiumModule.FPDFSignatureObj_GetTime(signatureObjPtr, buffer, bufferLength);
        },
        this.pdfiumModule.pdfium.UTF8ToString
      );
      const docMDP = this.pdfiumModule.FPDFSignatureObj_GetDocMDPPermission(signatureObjPtr);
      signatures.push({
        contents,
        byteRange,
        subFilter,
        reason,
        time,
        docMDP
      });
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetSignatures\`, "End", doc.id);
    return PdfTaskHelper.resolve(signatures);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getBookmarks}
   *
   * @public
   */
  getBookmarks(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getBookmarks", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetBookmarks\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`getBookmarks\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const bookmarks = this.readPdfBookmarks(ctx.docPtr, 0);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetBookmarks\`, "End", doc.id);
    return PdfTaskHelper.resolve({
      bookmarks
    });
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setBookmarks}
   *
   * @public
   */
  setBookmarks(doc, list) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "setBookmarks", doc, list);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SetBookmarks\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SetBookmarks\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    if (!this.pdfiumModule.EPDFBookmark_Clear(ctx.docPtr)) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SetBookmarks\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: "failed to clear existing bookmarks"
      });
    }
    const build = (parentPtr, items) => {
      var _a;
      for (const item of items) {
        const bmPtr = this.withWString(
          item.title ?? "",
          (wptr) => this.pdfiumModule.EPDFBookmark_AppendChild(ctx.docPtr, parentPtr, wptr)
        );
        if (!bmPtr) return false;
        if (item.target) {
          const ok2 = this.applyBookmarkTarget(ctx.docPtr, bmPtr, item.target);
          if (!ok2) return false;
        }
        if ((_a = item.children) == null ? void 0 : _a.length) {
          const ok2 = build(bmPtr, item.children);
          if (!ok2) return false;
        }
      }
      return true;
    };
    const ok = build(
      /*top-level*/
      0,
      list
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SetBookmarks\`, "End", doc.id);
    if (!ok) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: "failed to build bookmark tree"
      });
    }
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.deleteBookmarks}
   *
   * @public
   */
  deleteBookmarks(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "deleteBookmarks", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteBookmarks\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteBookmarks\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const ok = this.pdfiumModule.EPDFBookmark_Clear(ctx.docPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteBookmarks\`, "End", doc.id);
    return ok ? PdfTaskHelper.resolve(true) : PdfTaskHelper.reject({
      code: PdfErrorCode.Unknown,
      message: "failed to clear bookmarks"
    });
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPage}
   *
   * @public
   */
  renderPage(doc, page, options) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "renderPage", doc, page, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`RenderPage\`, "Begin", \`\${doc.id}-\${page.index}\`);
    const rect = { origin: { x: 0, y: 0 }, size: page.size };
    const task = this.renderRectEncoded(doc, page, rect, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`RenderPage\`, "End", \`\${doc.id}-\${page.index}\`);
    return task;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPageRect}
   *
   * @public
   */
  renderPageRect(doc, page, rect, options) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "renderPageRect", doc, page, rect, options);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`RenderPageRect\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const task = this.renderRectEncoded(doc, page, rect, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`RenderPageRect\`, "End", \`\${doc.id}-\${page.index}\`);
    return task;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAllAnnotations}
   *
   * @public
   */
  getAllAnnotations(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getAllAnnotations-with-progress", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetAllAnnotations", "Begin", doc.id);
    const task = PdfTaskHelper.create();
    let cancelled = false;
    task.wait(ignore, (err) => {
      if (err.type === "abort") cancelled = true;
    });
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetAllAnnotations", "End", doc.id);
      task.reject({ code: PdfErrorCode.DocNotOpen, message: "document does not open" });
      return task;
    }
    const CHUNK_SIZE = 100;
    const out = {};
    const processChunk = (startIdx) => {
      if (cancelled) return;
      const endIdx = Math.min(startIdx + CHUNK_SIZE, doc.pageCount);
      for (let pageIdx = startIdx; pageIdx < endIdx && !cancelled; ++pageIdx) {
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "GetAllAnnotations", "Begin", doc.id, pageIdx);
        const annots = this.readPageAnnotationsRaw(ctx, doc.pages[pageIdx]);
        out[pageIdx] = annots;
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "GetAllAnnotations", "End", doc.id, pageIdx);
        task.progress({ page: pageIdx, annotations: annots });
      }
      if (cancelled) return;
      if (endIdx >= doc.pageCount) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetAllAnnotations", "End", doc.id);
        task.resolve(out);
        return;
      }
      setTimeout(() => processChunk(endIdx), 0);
    };
    processChunk(0);
    return task;
  }
  readAllAnnotations(doc, ctx) {
    const annotationsByPage = {};
    for (let i = 0; i < doc.pageCount; i++) {
      const pageAnnotations = this.readPageAnnotations(ctx, doc.pages[i]);
      annotationsByPage[i] = pageAnnotations;
    }
    return annotationsByPage;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageAnnotations}
   *
   * @public
   */
  getPageAnnotations(doc, page) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getPageAnnotations", doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`GetPageAnnotations\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`GetPageAnnotations\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const annotations = this.readPageAnnotations(ctx, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`GetPageAnnotations\`,
      "End",
      \`\${doc.id}-\${page.index}\`
    );
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`GetPageAnnotations\`,
      \`\${doc.id}-\${page.index}\`,
      annotations
    );
    return PdfTaskHelper.resolve(annotations);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.createPageAnnotation}
   *
   * @public
   */
  createPageAnnotation(doc, page, annotation, context) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "createPageAnnotation", doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`CreatePageAnnotation\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`CreatePageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const annotationPtr = this.pdfiumModule.EPDFPage_CreateAnnot(pageCtx.pagePtr, annotation.type);
    if (!annotationPtr) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`CreatePageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      pageCtx.release();
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateAnnot,
        message: "can not create annotation with specified type"
      });
    }
    if (!isUuidV4(annotation.id)) {
      annotation.id = uuidV4();
    }
    if (!this.setAnnotString(annotationPtr, "NM", annotation.id)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      pageCtx.release();
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotString,
        message: "can not set the name of the annotation"
      });
    }
    if (!this.setPageAnnoRect(page, annotationPtr, annotation.rect)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`CreatePageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotRect,
        message: "can not set the rect of the annotation"
      });
    }
    let isSucceed = false;
    switch (annotation.type) {
      case PdfAnnotationSubtype.INK:
        isSucceed = this.addInkStroke(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.STAMP:
        isSucceed = this.addStampContent(
          ctx.docPtr,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          annotation,
          context == null ? void 0 : context.imageData
        );
        break;
      case PdfAnnotationSubtype.TEXT:
        isSucceed = this.addTextContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.FREETEXT:
        isSucceed = this.addFreeTextContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.LINE:
        isSucceed = this.addLineContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.POLYLINE:
      case PdfAnnotationSubtype.POLYGON:
        isSucceed = this.addPolyContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE:
        isSucceed = this.addShapeContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY:
      case PdfAnnotationSubtype.HIGHLIGHT:
        isSucceed = this.addTextMarkupContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
    }
    if (!isSucceed) {
      this.pdfiumModule.FPDFPage_RemoveAnnot(pageCtx.pagePtr, annotationPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`CreatePageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotContent,
        message: "can not add content of the annotation"
      });
    }
    if (annotation.blendMode !== void 0) {
      this.pdfiumModule.EPDFAnnot_GenerateAppearanceWithBlend(annotationPtr, annotation.blendMode);
    } else {
      this.pdfiumModule.EPDFAnnot_GenerateAppearance(annotationPtr);
    }
    this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`CreatePageAnnotation\`,
      "End",
      \`\${doc.id}-\${page.index}\`
    );
    return PdfTaskHelper.resolve(annotation.id);
  }
  /**
   * Update an existing page annotation in-place
   *
   *  • Locates the annot by page-local index (\`annotation.id\`)
   *  • Re-writes its /Rect and type-specific payload
   *  • Calls FPDFPage_GenerateContent so the new appearance is rendered
   *
   * @returns PdfTask<boolean>  –  true on success
   */
  updatePageAnnotation(doc, page, annotation) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "updatePageAnnotation", doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      "UpdatePageAnnotation",
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        "UpdatePageAnnotation",
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        "UpdatePageAnnotation",
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: "annotation not found" });
    }
    if (!this.setPageAnnoRect(page, annotPtr, annotation.rect)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        "UpdatePageAnnotation",
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotRect,
        message: "failed to move annotation"
      });
    }
    let ok = false;
    switch (annotation.type) {
      /* ── Ink ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.INK: {
        if (!this.pdfiumModule.FPDFAnnot_RemoveInkList(annotPtr)) break;
        ok = this.addInkStroke(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Stamp ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.STAMP: {
        ok = this.addStampContent(ctx.docPtr, page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      case PdfAnnotationSubtype.TEXT: {
        ok = this.addTextContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Free text ────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.FREETEXT: {
        ok = this.addFreeTextContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Shape ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE: {
        ok = this.addShapeContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Line ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.LINE: {
        ok = this.addLineContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Polygon / Polyline ───────────────────────────────────────────────── */
      case PdfAnnotationSubtype.POLYGON:
      case PdfAnnotationSubtype.POLYLINE: {
        ok = this.addPolyContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Text-markup family ──────────────────────────────────────────────── */
      case PdfAnnotationSubtype.HIGHLIGHT:
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY: {
        ok = this.addTextMarkupContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }
      /* ── Unsupported edits – fall through to error ───────────────────────── */
      default:
        ok = false;
    }
    if (ok) {
      if (annotation.blendMode !== void 0) {
        this.pdfiumModule.EPDFAnnot_GenerateAppearanceWithBlend(annotPtr, annotation.blendMode);
      } else {
        this.pdfiumModule.EPDFAnnot_GenerateAppearance(annotPtr);
      }
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }
    this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      "UpdatePageAnnotation",
      "End",
      \`\${doc.id}-\${page.index}\`
    );
    return ok ? PdfTaskHelper.resolve(true) : PdfTaskHelper.reject({
      code: PdfErrorCode.CantSetAnnotContent,
      message: "failed to update annotation"
    });
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removePageAnnotation}
   *
   * @public
   */
  removePageAnnotation(doc, page, annotation) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "removePageAnnotation", doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`RemovePageAnnotation\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`RemovePageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    let result = false;
    result = this.removeAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!result) {
      this.logger.error(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`FPDFPage_RemoveAnnot Failed\`,
        \`\${doc.id}-\${page.index}\`
      );
    } else {
      result = this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
      if (!result) {
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          \`FPDFPage_GenerateContent Failed\`,
          \`\${doc.id}-\${page.index}\`
        );
      }
    }
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`RemovePageAnnotation\`,
      "End",
      \`\${doc.id}-\${page.index}\`
    );
    return PdfTaskHelper.resolve(result);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageTextRects}
   *
   * @public
   */
  getPageTextRects(doc, page) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getPageTextRects", doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`GetPageTextRects\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`GetPageTextRects\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = this.pdfiumModule.FPDFText_LoadPage(pageCtx.pagePtr);
    const textRects = this.readPageTextRects(page, pageCtx.docPtr, pageCtx.pagePtr, textPagePtr);
    this.pdfiumModule.FPDFText_ClosePage(textPagePtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`GetPageTextRects\`,
      "End",
      \`\${doc.id}-\${page.index}\`
    );
    return PdfTaskHelper.resolve(textRects);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderThumbnail}
   *
   * @public
   */
  renderThumbnail(doc, page, options) {
    const { scaleFactor = 1, ...rest } = options ?? {};
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "renderThumbnail", doc, page, options);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`RenderThumbnail\`,
      "Begin",
      \`\${doc.id}-\${page.index}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`RenderThumbnail\`,
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const result = this.renderPage(doc, page, {
      scaleFactor: Math.max(scaleFactor, 0.5),
      ...rest
    });
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`RenderThumbnail\`, "End", \`\${doc.id}-\${page.index}\`);
    return result;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAttachments}
   *
   * @public
   */
  getAttachments(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getAttachments", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetAttachments\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetAttachments\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const attachments = [];
    const count = this.pdfiumModule.FPDFDoc_GetAttachmentCount(ctx.docPtr);
    for (let i = 0; i < count; i++) {
      const attachment = this.readPdfAttachment(ctx.docPtr, i);
      attachments.push(attachment);
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`GetAttachments\`, "End", doc.id);
    return PdfTaskHelper.resolve(attachments);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.addAttachment}
   *
   * @public
   */
  addAttachment(doc, params) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "addAttachment", doc, params == null ? void 0 : params.name);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const { name, description, mimeType, data } = params ?? {};
    if (!name) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: "attachment name is required"
      });
    }
    if (!data || (data instanceof Uint8Array ? data.byteLength === 0 : data.byteLength === 0)) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: "attachment data is empty"
      });
    }
    const attachmentPtr = this.withWString(
      name,
      (wNamePtr) => this.pdfiumModule.FPDFDoc_AddAttachment(ctx.docPtr, wNamePtr)
    );
    if (!attachmentPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: \`An attachment named "\${name}" already exists\`
      });
    }
    this.withWString(
      description,
      (wDescriptionPtr) => this.pdfiumModule.EPDFAttachment_SetDescription(attachmentPtr, wDescriptionPtr)
    );
    this.pdfiumModule.EPDFAttachment_SetSubtype(attachmentPtr, mimeType);
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const len = u8.byteLength;
    const contentPtr = this.memoryManager.malloc(len);
    try {
      this.pdfiumModule.pdfium.HEAPU8.set(u8, contentPtr);
      const ok = this.pdfiumModule.FPDFAttachment_SetFile(
        attachmentPtr,
        ctx.docPtr,
        contentPtr,
        len
      );
      if (!ok) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
        return PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: "failed to write attachment bytes"
        });
      }
    } finally {
      this.memoryManager.free(contentPtr);
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`AddAttachment\`, "End", doc.id);
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removeAttachment}
   *
   * @public
   */
  removeAttachment(doc, attachment) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "deleteAttachment", doc, attachment);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteAttachment\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const count = this.pdfiumModule.FPDFDoc_GetAttachmentCount(ctx.docPtr);
    if (attachment.index < 0 || attachment.index >= count) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteAttachment\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: \`attachment index \${attachment.index} out of range\`
      });
    }
    const ok = this.pdfiumModule.FPDFDoc_DeleteAttachment(ctx.docPtr, attachment.index);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`DeleteAttachment\`, "End", doc.id);
    if (!ok) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: "failed to delete attachment"
      });
    }
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.readAttachmentContent}
   *
   * @public
   */
  readAttachmentContent(doc, attachment) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "readAttachmentContent", doc, attachment);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ReadAttachmentContent\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ReadAttachmentContent\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const attachmentPtr = this.pdfiumModule.FPDFDoc_GetAttachment(ctx.docPtr, attachment.index);
    const sizePtr = this.memoryManager.malloc(4);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, 0, 0, sizePtr)) {
      this.memoryManager.free(sizePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ReadAttachmentContent\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantReadAttachmentSize,
        message: "can not read attachment size"
      });
    }
    const size = this.pdfiumModule.pdfium.getValue(sizePtr, "i32") >>> 0;
    const contentPtr = this.memoryManager.malloc(size);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, contentPtr, size, sizePtr)) {
      this.memoryManager.free(sizePtr);
      this.memoryManager.free(contentPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ReadAttachmentContent\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantReadAttachmentContent,
        message: "can not read attachment content"
      });
    }
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (let i = 0; i < size; i++) {
      view.setInt8(i, this.pdfiumModule.pdfium.getValue(contentPtr + i, "i8"));
    }
    this.memoryManager.free(sizePtr);
    this.memoryManager.free(contentPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ReadAttachmentContent\`, "End", doc.id);
    return PdfTaskHelper.resolve(buffer);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setFormFieldValue}
   *
   * @public
   */
  setFormFieldValue(doc, page, annotation, value) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "SetFormFieldValue", doc, annotation, value);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`SetFormFieldValue\`,
      "Begin",
      \`\${doc.id}-\${annotation.id}\`
    );
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "SetFormFieldValue", "document is not opened");
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`SetFormFieldValue\`,
        "End",
        \`\${doc.id}-\${annotation.id}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const formFillInfoPtr = this.pdfiumModule.PDFiumExt_OpenFormFillInfo();
    const formHandle = this.pdfiumModule.PDFiumExt_InitFormFillEnvironment(
      ctx.docPtr,
      formFillInfoPtr
    );
    const pageCtx = ctx.acquirePage(page.index);
    this.pdfiumModule.FORM_OnAfterLoadPage(pageCtx.pagePtr, formHandle);
    const annotationPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotationPtr) {
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        "SetFormFieldValue",
        "End",
        \`\${doc.id}-\${page.index}\`
      );
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: "annotation not found" });
    }
    if (!this.pdfiumModule.FORM_SetFocusedAnnot(formHandle, annotationPtr)) {
      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        "SetFormFieldValue",
        "failed to set focused annotation"
      );
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`SetFormFieldValue\`,
        "End",
        \`\${doc.id}-\${annotation.id}\`
      );
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
      pageCtx.release();
      this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
      this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantFocusAnnot,
        message: "failed to set focused annotation"
      });
    }
    switch (value.kind) {
      case "text":
        {
          if (!this.pdfiumModule.FORM_SelectAllText(formHandle, pageCtx.pagePtr)) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              "SetFormFieldValue",
              "failed to select all text"
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              \`SetFormFieldValue\`,
              "End",
              \`\${doc.id}-\${annotation.id}\`
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);
            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantSelectText,
              message: "failed to select all text"
            });
          }
          const length = 2 * (value.text.length + 1);
          const textPtr = this.memoryManager.malloc(length);
          this.pdfiumModule.pdfium.stringToUTF16(value.text, textPtr, length);
          this.pdfiumModule.FORM_ReplaceSelection(formHandle, pageCtx.pagePtr, textPtr);
          this.memoryManager.free(textPtr);
        }
        break;
      case "selection":
        {
          if (!this.pdfiumModule.FORM_SetIndexSelected(
            formHandle,
            pageCtx.pagePtr,
            value.index,
            value.isSelected
          )) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              "SetFormFieldValue",
              "failed to set index selected"
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              \`SetFormFieldValue\`,
              "End",
              \`\${doc.id}-\${annotation.id}\`
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);
            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantSelectOption,
              message: "failed to set index selected"
            });
          }
        }
        break;
      case "checked":
        {
          const kReturn = 13;
          if (!this.pdfiumModule.FORM_OnChar(formHandle, pageCtx.pagePtr, kReturn, 0)) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              "SetFormFieldValue",
              "failed to set field checked"
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              \`SetFormFieldValue\`,
              "End",
              \`\${doc.id}-\${annotation.id}\`
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);
            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantCheckField,
              message: "failed to set field checked"
            });
          }
        }
        break;
    }
    this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
    this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
    this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
    pageCtx.release();
    this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
    this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.flattenPage}
   *
   * @public
   */
  flattenPage(doc, page, options) {
    const { flag = PdfPageFlattenFlag.Display } = options ?? {};
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "flattenPage", doc, page, flag);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`flattenPage\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`flattenPage\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const result = this.pdfiumModule.FPDFPage_Flatten(pageCtx.pagePtr, flag);
    pageCtx.release();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`flattenPage\`, "End", doc.id);
    return PdfTaskHelper.resolve(result);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractPages}
   *
   * @public
   */
  extractPages(doc, pageIndexes) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "extractPages", doc, pageIndexes);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractPages\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractPages\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractPages\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: "can not create new document"
      });
    }
    const pageIndexesPtr = this.memoryManager.malloc(pageIndexes.length * 4);
    for (let i = 0; i < pageIndexes.length; i++) {
      this.pdfiumModule.pdfium.setValue(pageIndexesPtr + i * 4, pageIndexes[i], "i32");
    }
    if (!this.pdfiumModule.FPDF_ImportPagesByIndex(
      newDocPtr,
      ctx.docPtr,
      pageIndexesPtr,
      pageIndexes.length,
      0
    )) {
      this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractPages\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantImportPages,
        message: "can not import pages to new document"
      });
    }
    const buffer = this.saveDocument(newDocPtr);
    this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractPages\`, "End", doc.id);
    return PdfTaskHelper.resolve(buffer);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractText}
   *
   * @public
   */
  extractText(doc, pageIndexes) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "extractText", doc, pageIndexes);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractText\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractText\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const strings = [];
    for (let i = 0; i < pageIndexes.length; i++) {
      const pageCtx = ctx.acquirePage(pageIndexes[i]);
      const textPagePtr = this.pdfiumModule.FPDFText_LoadPage(pageCtx.pagePtr);
      const charCount = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
      const bufferPtr = this.memoryManager.malloc((charCount + 1) * 2);
      this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, charCount, bufferPtr);
      const text2 = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
      this.memoryManager.free(bufferPtr);
      strings.push(text2);
      this.pdfiumModule.FPDFText_ClosePage(textPagePtr);
      pageCtx.release();
    }
    const text = strings.join("\\n\\n");
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`ExtractText\`, "End", doc.id);
    return PdfTaskHelper.resolve(text);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getTextSlices}
   *
   * @public
   */
  getTextSlices(doc, slices) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getTextSlices", doc, slices);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetTextSlices", "Begin", doc.id);
    if (slices.length === 0) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetTextSlices", "End", doc.id);
      return PdfTaskHelper.resolve([]);
    }
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetTextSlices", "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    try {
      const out = new Array(slices.length);
      const byPage = /* @__PURE__ */ new Map();
      slices.forEach((s, i) => {
        (byPage.get(s.pageIndex) ?? byPage.set(s.pageIndex, []).get(s.pageIndex)).push({
          slice: s,
          pos: i
        });
      });
      for (const [pageIdx, list] of byPage) {
        const pageCtx = ctx.acquirePage(pageIdx);
        const textPagePtr = pageCtx.getTextPage();
        for (const { slice, pos } of list) {
          const bufPtr = this.memoryManager.malloc(2 * (slice.charCount + 1));
          this.pdfiumModule.FPDFText_GetText(textPagePtr, slice.charIndex, slice.charCount, bufPtr);
          out[pos] = stripPdfUnwantedMarkers(this.pdfiumModule.pdfium.UTF16ToString(bufPtr));
          this.memoryManager.free(bufPtr);
        }
        pageCtx.release();
      }
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetTextSlices", "End", doc.id);
      return PdfTaskHelper.resolve(out);
    } catch (e) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, "getTextSlices error", e);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "GetTextSlices", "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: String(e)
      });
    }
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.merge}
   *
   * @public
   */
  merge(files) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "merge", files);
    const fileIds = files.map((file2) => file2.id).join(".");
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Merge\`, "Begin", fileIds);
    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Merge\`, "End", fileIds);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: "can not create new document"
      });
    }
    const ptrs = [];
    for (const file2 of files.reverse()) {
      const array = new Uint8Array(file2.content);
      const length = array.length;
      const filePtr = this.memoryManager.malloc(length);
      this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);
      const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, "");
      if (!docPtr) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          \`FPDF_LoadMemDocument failed with \${lastError}\`
        );
        this.memoryManager.free(filePtr);
        for (const ptr of ptrs) {
          this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
          this.memoryManager.free(ptr.filePtr);
        }
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Merge\`, "End", fileIds);
        return PdfTaskHelper.reject({
          code: lastError,
          message: \`FPDF_LoadMemDocument failed\`
        });
      }
      ptrs.push({ filePtr, docPtr });
      if (!this.pdfiumModule.FPDF_ImportPages(newDocPtr, docPtr, "", 0)) {
        this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
        for (const ptr of ptrs) {
          this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
          this.memoryManager.free(ptr.filePtr);
        }
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Merge\`, "End", fileIds);
        return PdfTaskHelper.reject({
          code: PdfErrorCode.CantImportPages,
          message: "can not import pages to new document"
        });
      }
    }
    const buffer = this.saveDocument(newDocPtr);
    this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
    for (const ptr of ptrs) {
      this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
      this.memoryManager.free(ptr.filePtr);
    }
    const file = {
      id: \`\${Math.random()}\`,
      content: buffer
    };
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`Merge\`, "End", fileIds);
    return PdfTaskHelper.resolve(file);
  }
  /**
   * Merges specific pages from multiple PDF documents in a custom order
   *
   * @param mergeConfigs Array of configurations specifying which pages to merge from which documents
   * @returns A PdfTask that resolves with the merged PDF file
   * @public
   */
  mergePages(mergeConfigs) {
    const configIds = mergeConfigs.map((config) => \`\${config.docId}:\${config.pageIndices.join(",")}\`).join("|");
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "mergePages", mergeConfigs);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`MergePages\`, "Begin", configIds);
    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`MergePages\`, "End", configIds);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: "Cannot create new document"
      });
    }
    try {
      for (const config of [...mergeConfigs].reverse()) {
        const ctx = this.cache.getContext(config.docId);
        if (!ctx) {
          this.logger.warn(
            LOG_SOURCE,
            LOG_CATEGORY,
            \`Document \${config.docId} is not open, skipping\`
          );
          continue;
        }
        const pageCount = this.pdfiumModule.FPDF_GetPageCount(ctx.docPtr);
        const validPageIndices = config.pageIndices.filter(
          (index) => index >= 0 && index < pageCount
        );
        if (validPageIndices.length === 0) {
          continue;
        }
        const pageString = validPageIndices.map((index) => index + 1).join(",");
        try {
          if (!this.pdfiumModule.FPDF_ImportPages(
            newDocPtr,
            ctx.docPtr,
            pageString,
            0
            // Insert at the beginning
          )) {
            throw new Error(\`Failed to import pages \${pageString} from document \${config.docId}\`);
          }
        } finally {
        }
      }
      const buffer = this.saveDocument(newDocPtr);
      const file = {
        id: \`\${Math.random()}\`,
        content: buffer
      };
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`MergePages\`, "End", configIds);
      return PdfTaskHelper.resolve(file);
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, "mergePages failed", error);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`MergePages\`, "End", configIds);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantImportPages,
        message: error instanceof Error ? error.message : "Failed to merge pages"
      });
    } finally {
      if (newDocPtr) {
        this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
      }
    }
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.saveAsCopy}
   *
   * @public
   */
  saveAsCopy(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "saveAsCopy", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SaveAsCopy\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SaveAsCopy\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const buffer = this.saveDocument(ctx.docPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`SaveAsCopy\`, "End", doc.id);
    return PdfTaskHelper.resolve(buffer);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeDocument}
   *
   * @public
   */
  closeDocument(doc) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "closeDocument", doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`CloseDocument\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`CloseDocument\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    ctx.dispose();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`CloseDocument\`, "End", doc.id);
    return PdfTaskHelper.resolve(true);
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeAllDocuments}
   *
   * @public
   */
  closeAllDocuments() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "closeAllDocuments");
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`CloseAllDocuments\`, "Begin");
    this.cache.closeAllDocuments();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`CloseAllDocuments\`, "End");
    return PdfTaskHelper.resolve(true);
  }
  /**
   * Add text content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to text annotation
   * @param annotation - text annotation
   * @returns whether text content is added to annotation
   *
   * @private
   */
  addTextContent(page, pagePtr, annotationPtr, annotation) {
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.inReplyToId && !this.setInReplyToId(pagePtr, annotationPtr, annotation.inReplyToId)) {
      return false;
    }
    if (!this.setAnnotationIcon(annotationPtr, annotation.icon || PdfAnnotationIcon.Comment)) {
      return false;
    }
    if (!this.setAnnotationFlags(annotationPtr, annotation.flags || ["print", "noZoom", "noRotate"])) {
      return false;
    }
    if (annotation.state && !this.setAnnotString(annotationPtr, "State", annotation.state)) {
      return false;
    }
    if (annotation.stateModel && !this.setAnnotString(annotationPtr, "StateModel", annotation.stateModel)) {
      return false;
    }
    return true;
  }
  /**
   * Add free text content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to free text annotation
   * @param annotation - free text annotation
   * @returns whether free text content is added to annotation
   *
   * @private
   */
  addFreeTextContent(page, pagePtr, annotationPtr, annotation) {
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, 0)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationTextAlignment(annotationPtr, annotation.textAlign)) {
      return false;
    }
    if (!this.setAnnotationVerticalAlignment(annotationPtr, annotation.verticalAlign)) {
      return false;
    }
    if (!this.setAnnotationDefaultAppearance(
      annotationPtr,
      annotation.fontFamily,
      annotation.fontSize,
      annotation.fontColor
    )) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    if (!annotation.backgroundColor || annotation.backgroundColor === "transparent") {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.Color)) {
        return false;
      }
    } else if (!this.setAnnotationColor(
      annotationPtr,
      annotation.backgroundColor ?? "#FFFFFF",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Set the rect of specified annotation
   * @param page - page info that the annotation is belonged to
   * @param pagePtr - pointer of page object
   * @param annotationPtr - pointer to annotation object
   * @param inkList - ink lists that added to the annotation
   * @returns whether the ink lists is setted
   *
   * @private
   */
  addInkStroke(page, pagePtr, annotationPtr, annotation) {
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setInkList(page, annotationPtr, annotation.inkList)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationColor(
      annotationPtr,
      annotation.color ?? "#FFFF00",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Add line content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to line annotation
   * @param annotation - line annotation
   * @returns whether line content is added to annotation
   *
   * @private
   */
  addLineContent(page, pagePtr, annotationPtr, annotation) {
    var _a, _b;
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (!this.setLinePoints(
      page,
      annotationPtr,
      annotation.linePoints.start,
      annotation.linePoints.end
    )) {
      return false;
    }
    if (!this.setLineEndings(
      annotationPtr,
      ((_a = annotation.lineEndings) == null ? void 0 : _a.start) ?? PdfAnnotationLineEnding.None,
      ((_b = annotation.lineEndings) == null ? void 0 : _b.end) ?? PdfAnnotationLineEnding.None
    )) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    if (!annotation.color || annotation.color === "transparent") {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)) {
        return false;
      }
    } else if (!this.setAnnotationColor(
      annotationPtr,
      annotation.color ?? "#FFFF00",
      PdfAnnotationColorType.InteriorColor
    )) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationColor(
      annotationPtr,
      annotation.strokeColor ?? "#FFFF00",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Add polygon or polyline content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to polygon or polyline annotation
   * @param annotation - polygon or polyline annotation
   * @returns whether polygon or polyline content is added to annotation
   *
   * @private
   */
  addPolyContent(page, pagePtr, annotationPtr, annotation) {
    var _a, _b;
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.type === PdfAnnotationSubtype.POLYLINE && !this.setLineEndings(
      annotationPtr,
      ((_a = annotation.lineEndings) == null ? void 0 : _a.start) ?? PdfAnnotationLineEnding.None,
      ((_b = annotation.lineEndings) == null ? void 0 : _b.end) ?? PdfAnnotationLineEnding.None
    )) {
      return false;
    }
    if (!this.setPdfAnnoVertices(page, annotationPtr, annotation.vertices)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    if (!annotation.color || annotation.color === "transparent") {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)) {
        return false;
      }
    } else if (!this.setAnnotationColor(
      annotationPtr,
      annotation.color ?? "#FFFF00",
      PdfAnnotationColorType.InteriorColor
    )) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationColor(
      annotationPtr,
      annotation.strokeColor ?? "#FFFF00",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Add shape content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to shape annotation
   * @param annotation - shape annotation
   * @returns whether shape content is added to annotation
   *
   * @private
   */
  addShapeContent(page, pagePtr, annotationPtr, annotation) {
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (!this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (!annotation.color || annotation.color === "transparent") {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)) {
        return false;
      }
    } else if (!this.setAnnotationColor(
      annotationPtr,
      annotation.color ?? "#FFFF00",
      PdfAnnotationColorType.InteriorColor
    )) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationColor(
      annotationPtr,
      annotation.strokeColor ?? "#FFFF00",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Add highlight content to annotation
   * @param page - page info
   * @param annotationPtr - pointer to highlight annotation
   * @param annotation - highlight annotation
   * @returns whether highlight content is added to annotation
   *
   * @private
   */
  addTextMarkupContent(page, pagePtr, annotationPtr, annotation) {
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.custom && !this.setAnnotCustom(annotationPtr, annotation.custom)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (!this.syncQuadPointsAnno(page, annotationPtr, annotation.segmentRects)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "T", annotation.author || "")) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationColor(
      annotationPtr,
      annotation.color ?? "#FFFF00",
      PdfAnnotationColorType.Color
    )) {
      return false;
    }
    return true;
  }
  /**
   * Add contents to stamp annotation
   * @param docPtr - pointer to pdf document object
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to stamp annotation
   * @param rect - rect of stamp annotation
   * @param contents - contents of stamp annotation
   * @returns whether contents is added to annotation
   *
   * @private
   */
  addStampContent(docPtr, page, pagePtr, annotationPtr, annotation, imageData) {
    if (annotation.created && !this.setAnnotationDate(annotationPtr, "CreationDate", annotation.created)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, "M", annotation.modified)) {
      return false;
    }
    if (annotation.icon && !this.setAnnotationIcon(annotationPtr, annotation.icon)) {
      return false;
    }
    if (annotation.subject && !this.setAnnotString(annotationPtr, "Subj", annotation.subject)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, "Contents", annotation.contents ?? "")) {
      return false;
    }
    if (imageData) {
      for (let i = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr) - 1; i >= 0; i--) {
        this.pdfiumModule.FPDFAnnot_RemoveObject(annotationPtr, i);
      }
      if (!this.addImageObject(docPtr, page, pagePtr, annotationPtr, annotation.rect, imageData)) {
        return false;
      }
    }
    if (!this.pdfiumModule.EPDFAnnot_UpdateAppearanceToRect(annotationPtr, PdfStampFit.Cover)) {
      return false;
    }
    return true;
  }
  /**
   * Add image object to annotation
   * @param docPtr - pointer to pdf document object
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to stamp annotation
   * @param position - position of image
   * @param imageData - data of image
   * @returns whether image is added to annotation
   *
   * @private
   */
  addImageObject(docPtr, page, pagePtr, annotationPtr, rect, imageData) {
    const bytesPerPixel = 4;
    const pixelCount = imageData.width * imageData.height;
    const bitmapBufferPtr = this.memoryManager.malloc(bytesPerPixel * pixelCount);
    if (!bitmapBufferPtr) {
      return false;
    }
    for (let i = 0; i < pixelCount; i++) {
      const red = imageData.data[i * bytesPerPixel];
      const green = imageData.data[i * bytesPerPixel + 1];
      const blue = imageData.data[i * bytesPerPixel + 2];
      const alpha = imageData.data[i * bytesPerPixel + 3];
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel, blue, "i8");
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 1, green, "i8");
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 2, red, "i8");
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 3, alpha, "i8");
    }
    const format = 4;
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      imageData.width,
      imageData.height,
      format,
      bitmapBufferPtr,
      0
    );
    if (!bitmapPtr) {
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    const imageObjectPtr = this.pdfiumModule.FPDFPageObj_NewImageObj(docPtr);
    if (!imageObjectPtr) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    if (!this.pdfiumModule.FPDFImageObj_SetBitmap(pagePtr, 0, imageObjectPtr, bitmapPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    const matrixPtr = this.memoryManager.malloc(6 * 4);
    this.pdfiumModule.pdfium.setValue(matrixPtr, imageData.width, "float");
    this.pdfiumModule.pdfium.setValue(matrixPtr + 4, 0, "float");
    this.pdfiumModule.pdfium.setValue(matrixPtr + 8, 0, "float");
    this.pdfiumModule.pdfium.setValue(matrixPtr + 12, imageData.height, "float");
    this.pdfiumModule.pdfium.setValue(matrixPtr + 16, 0, "float");
    this.pdfiumModule.pdfium.setValue(matrixPtr + 20, 0, "float");
    if (!this.pdfiumModule.FPDFPageObj_SetMatrix(imageObjectPtr, matrixPtr)) {
      this.memoryManager.free(matrixPtr);
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    this.memoryManager.free(matrixPtr);
    const pagePos = this.convertDevicePointToPagePoint(page, {
      x: rect.origin.x,
      y: rect.origin.y + imageData.height
      // shift down by the image height
    });
    this.pdfiumModule.FPDFPageObj_Transform(imageObjectPtr, 1, 0, 0, 1, pagePos.x, pagePos.y);
    if (!this.pdfiumModule.FPDFAnnot_AppendObject(annotationPtr, imageObjectPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    this.memoryManager.free(bitmapBufferPtr);
    return true;
  }
  /**
   * Save document to array buffer
   * @param docPtr - pointer to pdf document
   * @returns array buffer contains the pdf content
   *
   * @private
   */
  saveDocument(docPtr) {
    const writerPtr = this.pdfiumModule.PDFiumExt_OpenFileWriter();
    this.pdfiumModule.PDFiumExt_SaveAsCopy(docPtr, writerPtr);
    const size = this.pdfiumModule.PDFiumExt_GetFileWriterSize(writerPtr);
    const dataPtr = this.memoryManager.malloc(size);
    this.pdfiumModule.PDFiumExt_GetFileWriterData(writerPtr, dataPtr, size);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (let i = 0; i < size; i++) {
      view.setInt8(i, this.pdfiumModule.pdfium.getValue(dataPtr + i, "i8"));
    }
    this.memoryManager.free(dataPtr);
    this.pdfiumModule.PDFiumExt_CloseFileWriter(writerPtr);
    return buffer;
  }
  /**
   * Read Catalog /Lang via EPDFCatalog_GetLanguage (UTF-16LE → JS string).
   * Returns:
   *   null  -> /Lang not present (getter returned 0) OR doc not open,
   *   ''    -> /Lang exists but is explicitly empty,
   *   'en', 'en-US', ... -> normal tag.
   *
   * Note: EPDFCatalog_GetLanguage lengths are BYTES (incl. trailing NUL).
   *
   * @private
   */
  readCatalogLanguage(docPtr) {
    const byteLen = this.pdfiumModule.EPDFCatalog_GetLanguage(docPtr, 0, 0) >>> 0;
    if (byteLen === 0) return null;
    if (byteLen === 2) return "";
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => this.pdfiumModule.EPDFCatalog_GetLanguage(docPtr, buffer, bufferLength),
      this.pdfiumModule.pdfium.UTF16ToString,
      byteLen
    );
  }
  /**
   * Read metadata from pdf document
   * @param docPtr - pointer to pdf document
   * @param key - key of metadata field
   * @returns metadata value
   *
   * @private
   */
  readMetaText(docPtr, key) {
    const exists = !!this.pdfiumModule.EPDF_HasMetaText(docPtr, key);
    if (!exists) return null;
    const len = this.pdfiumModule.FPDF_GetMetaText(docPtr, key, 0, 0);
    if (len === 2) return "";
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => this.pdfiumModule.FPDF_GetMetaText(docPtr, key, buffer, bufferLength),
      this.pdfiumModule.pdfium.UTF16ToString,
      len
    );
  }
  /**
   * Write metadata into the PDF's Info dictionary.
   * If \`value\` is null or empty string, the key is removed.
   * @param docPtr - pointer to pdf document
   * @param key - key of metadata field
   * @param value - value of metadata field
   * @returns whether metadata is written to the pdf document
   *
   * @private
   */
  setMetaText(docPtr, key, value) {
    if (value == null || value.length === 0) {
      const ok = this.pdfiumModule.EPDF_SetMetaText(docPtr, key, 0);
      return !!ok;
    }
    const bytes = 2 * (value.length + 1);
    const ptr = this.memoryManager.malloc(bytes);
    try {
      this.pdfiumModule.pdfium.stringToUTF16(value, ptr, bytes);
      const ok = this.pdfiumModule.EPDF_SetMetaText(docPtr, key, ptr);
      return !!ok;
    } finally {
      this.memoryManager.free(ptr);
    }
  }
  /**
   * Read the document's trapped status via PDFium.
   * Falls back to \`Unknown\` on unexpected values.
   *
   * @private
   */
  getMetaTrapped(docPtr) {
    const raw = Number(this.pdfiumModule.EPDF_GetMetaTrapped(docPtr));
    switch (raw) {
      case PdfTrappedStatus.NotSet:
      case PdfTrappedStatus.True:
      case PdfTrappedStatus.False:
      case PdfTrappedStatus.Unknown:
        return raw;
      default:
        return PdfTrappedStatus.Unknown;
    }
  }
  /**
   * Write (or clear) the document's trapped status via PDFium.
   * Pass \`null\`/\`undefined\` to remove the \`/Trapped\` key.
   *
   * @private
   */
  setMetaTrapped(docPtr, status) {
    const toSet = status == null || status === void 0 ? PdfTrappedStatus.NotSet : status;
    const valid = toSet === PdfTrappedStatus.NotSet || toSet === PdfTrappedStatus.True || toSet === PdfTrappedStatus.False || toSet === PdfTrappedStatus.Unknown;
    if (!valid) return false;
    return !!this.pdfiumModule.EPDF_SetMetaTrapped(docPtr, toSet);
  }
  /**
   * Get the number of keys in the document's Info dictionary.
   * @param docPtr - pointer to pdf document
   * @param customOnly - if true, only count non-reserved (custom) keys; if false, count all keys.
   * @returns the number of keys (possibly 0). On error, returns 0.
   *
   * @private
   */
  getMetaKeyCount(docPtr, customOnly) {
    return Number(this.pdfiumModule.EPDF_GetMetaKeyCount(docPtr, customOnly)) | 0;
  }
  /**
   * Get the name of the Info dictionary key at |index|.
   * @param docPtr - pointer to pdf document
   * @param index - 0-based key index in the order returned by PDFium.
   * @param customOnly - if true, indexes only over non-reserved (custom) keys; if false, indexes over all keys.
   * @returns the name of the key, or null if the key is not found.
   *
   * @private
   */
  getMetaKeyName(docPtr, index, customOnly) {
    const len = this.pdfiumModule.EPDF_GetMetaKeyName(docPtr, index, customOnly, 0, 0);
    if (!len) return null;
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, buflen) => this.pdfiumModule.EPDF_GetMetaKeyName(docPtr, index, customOnly, buffer, buflen),
      this.pdfiumModule.pdfium.UTF8ToString,
      len
    );
  }
  /**
   * Read all metadata from the document's Info dictionary.
   * @param docPtr - pointer to pdf document
   * @param customOnly - if true, only read non-reserved (custom) keys; if false, read all keys.
   * @returns all metadata
   *
   * @private
   */
  readAllMeta(docPtr, customOnly = true) {
    const n = this.getMetaKeyCount(docPtr, customOnly);
    const out = {};
    for (let i = 0; i < n; i++) {
      const key = this.getMetaKeyName(docPtr, i, customOnly);
      if (!key) continue;
      out[key] = this.readMetaText(docPtr, key);
    }
    return out;
  }
  /**
   * Read bookmarks in the pdf document
   * @param docPtr - pointer to pdf document
   * @param rootBookmarkPtr - pointer to root bookmark
   * @returns bookmarks in the pdf document
   *
   * @private
   */
  readPdfBookmarks(docPtr, rootBookmarkPtr = 0) {
    let bookmarkPtr = this.pdfiumModule.FPDFBookmark_GetFirstChild(docPtr, rootBookmarkPtr);
    const bookmarks = [];
    while (bookmarkPtr) {
      const bookmark = this.readPdfBookmark(docPtr, bookmarkPtr);
      bookmarks.push(bookmark);
      const nextBookmarkPtr = this.pdfiumModule.FPDFBookmark_GetNextSibling(docPtr, bookmarkPtr);
      bookmarkPtr = nextBookmarkPtr;
    }
    return bookmarks;
  }
  /**
   * Read bookmark in the pdf document
   * @param docPtr - pointer to pdf document
   * @param bookmarkPtr - pointer to bookmark object
   * @returns pdf bookmark object
   *
   * @private
   */
  readPdfBookmark(docPtr, bookmarkPtr) {
    const title = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFBookmark_GetTitle(bookmarkPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const bookmarks = this.readPdfBookmarks(docPtr, bookmarkPtr);
    const target = this.readPdfBookmarkTarget(
      docPtr,
      () => {
        return this.pdfiumModule.FPDFBookmark_GetAction(bookmarkPtr);
      },
      () => {
        return this.pdfiumModule.FPDFBookmark_GetDest(docPtr, bookmarkPtr);
      }
    );
    return {
      title,
      target,
      children: bookmarks
    };
  }
  /**
   * Read text rects in pdf page
   * @param page - pdf page info
   * @param docPtr - pointer to pdf document
   * @param pagePtr - pointer to pdf page
   * @param textPagePtr - pointer to pdf text page
   * @returns text rects in the pdf page
   *
   * @public
   */
  readPageTextRects(page, docPtr, pagePtr, textPagePtr) {
    const rectsCount = this.pdfiumModule.FPDFText_CountRects(textPagePtr, 0, -1);
    const textRects = [];
    for (let i = 0; i < rectsCount; i++) {
      const topPtr = this.memoryManager.malloc(8);
      const leftPtr = this.memoryManager.malloc(8);
      const rightPtr = this.memoryManager.malloc(8);
      const bottomPtr = this.memoryManager.malloc(8);
      const isSucceed = this.pdfiumModule.FPDFText_GetRect(
        textPagePtr,
        i,
        leftPtr,
        topPtr,
        rightPtr,
        bottomPtr
      );
      if (!isSucceed) {
        this.memoryManager.free(leftPtr);
        this.memoryManager.free(topPtr);
        this.memoryManager.free(rightPtr);
        this.memoryManager.free(bottomPtr);
        continue;
      }
      const left = this.pdfiumModule.pdfium.getValue(leftPtr, "double");
      const top = this.pdfiumModule.pdfium.getValue(topPtr, "double");
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, "double");
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, "double");
      this.memoryManager.free(leftPtr);
      this.memoryManager.free(topPtr);
      this.memoryManager.free(rightPtr);
      this.memoryManager.free(bottomPtr);
      const deviceXPtr = this.memoryManager.malloc(4);
      const deviceYPtr = this.memoryManager.malloc(4);
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        left,
        top,
        deviceXPtr,
        deviceYPtr
      );
      const x = this.pdfiumModule.pdfium.getValue(deviceXPtr, "i32");
      const y = this.pdfiumModule.pdfium.getValue(deviceYPtr, "i32");
      this.memoryManager.free(deviceXPtr);
      this.memoryManager.free(deviceYPtr);
      const rect = {
        origin: {
          x,
          y
        },
        size: {
          width: Math.ceil(Math.abs(right - left)),
          height: Math.ceil(Math.abs(top - bottom))
        }
      };
      const utf16Length = this.pdfiumModule.FPDFText_GetBoundedText(
        textPagePtr,
        left,
        top,
        right,
        bottom,
        0,
        0
      );
      const bytesCount = (utf16Length + 1) * 2;
      const textBuffer = this.memoryManager.malloc(bytesCount);
      this.pdfiumModule.FPDFText_GetBoundedText(
        textPagePtr,
        left,
        top,
        right,
        bottom,
        textBuffer,
        utf16Length
      );
      const content = this.pdfiumModule.pdfium.UTF16ToString(textBuffer);
      this.memoryManager.free(textBuffer);
      const charIndex = this.pdfiumModule.FPDFText_GetCharIndexAtPos(textPagePtr, left, top, 2, 2);
      let fontFamily = "";
      let fontSize = rect.size.height;
      if (charIndex >= 0) {
        fontSize = this.pdfiumModule.FPDFText_GetFontSize(textPagePtr, charIndex);
        const fontNameLength = this.pdfiumModule.FPDFText_GetFontInfo(
          textPagePtr,
          charIndex,
          0,
          0,
          0
        );
        const bytesCount2 = fontNameLength + 1;
        const textBufferPtr = this.memoryManager.malloc(bytesCount2);
        const flagsPtr = this.memoryManager.malloc(4);
        this.pdfiumModule.FPDFText_GetFontInfo(
          textPagePtr,
          charIndex,
          textBufferPtr,
          bytesCount2,
          flagsPtr
        );
        fontFamily = this.pdfiumModule.pdfium.UTF8ToString(textBufferPtr);
        this.memoryManager.free(textBufferPtr);
        this.memoryManager.free(flagsPtr);
      }
      const textRect = {
        content,
        rect,
        font: {
          family: fontFamily,
          size: fontSize
        }
      };
      textRects.push(textRect);
    }
    return textRects;
  }
  /**
   * Return geometric + logical text layout for one page
   * (glyph-only implementation, no FPDFText_GetRect).
   *
   * @public
   */
  getPageGeometry(doc, page) {
    const label = "getPageGeometry";
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = pageCtx.getTextPage();
    const glyphCount = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
    const glyphs = [];
    for (let i = 0; i < glyphCount; i++) {
      const g = this.readGlyphInfo(page, pageCtx.pagePtr, textPagePtr, i);
      glyphs.push(g);
    }
    const runs = this.buildRunsFromGlyphs(glyphs, textPagePtr);
    pageCtx.release();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, "End", doc.id);
    return PdfTaskHelper.resolve({ runs });
  }
  /**
   * Group consecutive glyphs that belong to the same CPDF_TextObject
   * using FPDFText_GetTextObject(), and calculate rotation from glyph positions.
   */
  buildRunsFromGlyphs(glyphs, textPagePtr) {
    const runs = [];
    let current = null;
    let curObjPtr = null;
    let bounds = null;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      const objPtr = this.pdfiumModule.FPDFText_GetTextObject(textPagePtr, i);
      if (objPtr !== curObjPtr) {
        curObjPtr = objPtr;
        current = {
          rect: {
            x: g.origin.x,
            y: g.origin.y,
            width: g.size.width,
            height: g.size.height
          },
          charStart: i,
          glyphs: []
        };
        bounds = {
          minX: g.origin.x,
          minY: g.origin.y,
          maxX: g.origin.x + g.size.width,
          maxY: g.origin.y + g.size.height
        };
        runs.push(current);
      }
      current.glyphs.push({
        x: g.origin.x,
        y: g.origin.y,
        width: g.size.width,
        height: g.size.height,
        flags: g.isEmpty ? 2 : g.isSpace ? 1 : 0
      });
      if (g.isEmpty) {
        continue;
      }
      const right = g.origin.x + g.size.width;
      const bottom = g.origin.y + g.size.height;
      bounds.minX = Math.min(bounds.minX, g.origin.x);
      bounds.minY = Math.min(bounds.minY, g.origin.y);
      bounds.maxX = Math.max(bounds.maxX, right);
      bounds.maxY = Math.max(bounds.maxY, bottom);
      current.rect.x = bounds.minX;
      current.rect.y = bounds.minY;
      current.rect.width = bounds.maxX - bounds.minX;
      current.rect.height = bounds.maxY - bounds.minY;
    }
    return runs;
  }
  /**
   * Extract glyph geometry + metadata for \`charIndex\`
   *
   * Returns device–space coordinates:
   *   x,y  → **top-left** corner (integer-pixels)
   *   w,h  → width / height (integer-pixels, ≥ 1)
   *
   * And two flags:
   *   isSpace → true if the glyph's Unicode code-point is U+0020
   */
  readGlyphInfo(page, pagePtr, textPagePtr, charIndex) {
    const dx1Ptr = this.memoryManager.malloc(4);
    const dy1Ptr = this.memoryManager.malloc(4);
    const dx2Ptr = this.memoryManager.malloc(4);
    const dy2Ptr = this.memoryManager.malloc(4);
    const rectPtr = this.memoryManager.malloc(16);
    let x = 0, y = 0, width = 0, height = 0, isSpace = false;
    if (this.pdfiumModule.FPDFText_GetLooseCharBox(textPagePtr, charIndex, rectPtr)) {
      const left = this.pdfiumModule.pdfium.getValue(rectPtr, "float");
      const top = this.pdfiumModule.pdfium.getValue(rectPtr + 4, "float");
      const right = this.pdfiumModule.pdfium.getValue(rectPtr + 8, "float");
      const bottom = this.pdfiumModule.pdfium.getValue(rectPtr + 12, "float");
      if (left === right || top === bottom) {
        [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr].forEach((p) => this.memoryManager.free(p));
        return {
          origin: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
          isEmpty: true
        };
      }
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        /*rotate=*/
        0,
        left,
        top,
        dx1Ptr,
        dy1Ptr
      );
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        /*rotate=*/
        0,
        right,
        bottom,
        dx2Ptr,
        dy2Ptr
      );
      const x1 = this.pdfiumModule.pdfium.getValue(dx1Ptr, "i32");
      const y1 = this.pdfiumModule.pdfium.getValue(dy1Ptr, "i32");
      const x2 = this.pdfiumModule.pdfium.getValue(dx2Ptr, "i32");
      const y2 = this.pdfiumModule.pdfium.getValue(dy2Ptr, "i32");
      x = Math.min(x1, x2);
      y = Math.min(y1, y2);
      width = Math.max(1, Math.abs(x2 - x1));
      height = Math.max(1, Math.abs(y2 - y1));
      const uc = this.pdfiumModule.FPDFText_GetUnicode(textPagePtr, charIndex);
      isSpace = uc === 32;
    }
    [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr].forEach((p) => this.memoryManager.free(p));
    return {
      origin: { x, y },
      size: { width, height },
      ...isSpace && { isSpace }
    };
  }
  /**
   * Geometry-only text extraction
   * ------------------------------------------
   * Returns every glyph on the requested page
   * in the logical order delivered by PDFium.
   *
   * The promise resolves to an array of objects:
   *   {
   *     idx:     number;            // glyph index on the page (0…n-1)
   *     origin:  { x: number; y: number };
   *     size:    { width: number;  height: number };
   *     angle:   number;            // degrees, counter-clock-wise
   *     isSpace: boolean;           // true  → U+0020
   *   }
   *
   * No Unicode is included; front-end decides whether to hydrate it.
   */
  getPageGlyphs(doc, page) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "getPageGlyphs", doc, page);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "getPageGlyphs", "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "getPageGlyphs", "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = pageCtx.getTextPage();
    const total = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
    const glyphs = new Array(total);
    for (let i = 0; i < total; i++) {
      const g = this.readGlyphInfo(page, pageCtx.pagePtr, textPagePtr, i);
      if (g.isEmpty) {
        continue;
      }
      glyphs[i] = { ...g };
    }
    pageCtx.release();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "getPageGlyphs", "End", doc.id);
    return PdfTaskHelper.resolve(glyphs);
  }
  readCharBox(page, pagePtr, textPagePtr, charIndex) {
    const topPtr = this.memoryManager.malloc(8);
    const leftPtr = this.memoryManager.malloc(8);
    const bottomPtr = this.memoryManager.malloc(8);
    const rightPtr = this.memoryManager.malloc(8);
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    if (this.pdfiumModule.FPDFText_GetCharBox(
      textPagePtr,
      charIndex,
      leftPtr,
      rightPtr,
      bottomPtr,
      topPtr
    )) {
      const top = this.pdfiumModule.pdfium.getValue(topPtr, "double");
      const left = this.pdfiumModule.pdfium.getValue(leftPtr, "double");
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, "double");
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, "double");
      const deviceXPtr = this.memoryManager.malloc(4);
      const deviceYPtr = this.memoryManager.malloc(4);
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        left,
        top,
        deviceXPtr,
        deviceYPtr
      );
      x = this.pdfiumModule.pdfium.getValue(deviceXPtr, "i32");
      y = this.pdfiumModule.pdfium.getValue(deviceYPtr, "i32");
      this.memoryManager.free(deviceXPtr);
      this.memoryManager.free(deviceYPtr);
      width = Math.ceil(Math.abs(right - left));
      height = Math.ceil(Math.abs(top - bottom));
    }
    this.memoryManager.free(topPtr);
    this.memoryManager.free(leftPtr);
    this.memoryManager.free(bottomPtr);
    this.memoryManager.free(rightPtr);
    return {
      origin: {
        x,
        y
      },
      size: {
        width,
        height
      }
    };
  }
  /**
   * Read page annotations
   *
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  readPageAnnotations(ctx, page) {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const annotationCount = this.pdfiumModule.FPDFPage_GetAnnotCount(pageCtx.pagePtr);
      const annotations = [];
      for (let i = 0; i < annotationCount; i++) {
        pageCtx.withAnnotation(i, (annotPtr) => {
          const anno = this.readPageAnnotation(ctx.docPtr, page, annotPtr, pageCtx);
          if (anno) annotations.push(anno);
        });
      }
      return annotations;
    });
  }
  /**
   * Read page annotations
   *
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  readPageAnnotationsRaw(ctx, page) {
    const count = this.pdfiumModule.EPDFPage_GetAnnotCountRaw(ctx.docPtr, page.index);
    if (count <= 0) return [];
    const out = [];
    for (let i = 0; i < count; ++i) {
      const annotPtr = this.pdfiumModule.EPDFPage_GetAnnotRaw(ctx.docPtr, page.index, i);
      if (!annotPtr) continue;
      try {
        const anno = this.readPageAnnotation(ctx.docPtr, page, annotPtr);
        if (anno) out.push(anno);
      } finally {
        this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      }
    }
    return out;
  }
  /**
   * Read pdf annotation from pdf document
   *
   * @param docPtr - pointer to pdf document
   * @param page - page info
   * @param annotationPtr - pointer to pdf annotation
   * @param pageCtx - page context
   * @returns pdf annotation
   *
   * @private
   */
  readPageAnnotation(docPtr, page, annotationPtr, pageCtx) {
    let index = this.getAnnotString(annotationPtr, "NM");
    if (!index || !isUuidV4(index)) {
      index = uuidV4();
      this.setAnnotString(annotationPtr, "NM", index);
    }
    const subType = this.pdfiumModule.FPDFAnnot_GetSubtype(
      annotationPtr
    );
    let annotation;
    switch (subType) {
      case PdfAnnotationSubtype.TEXT:
        {
          annotation = this.readPdfTextAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.FREETEXT:
        {
          annotation = this.readPdfFreeTextAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINK:
        {
          annotation = this.readPdfLinkAnno(page, docPtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.WIDGET:
        if (pageCtx) {
          return this.readPdfWidgetAnno(page, annotationPtr, pageCtx.getFormHandle(), index);
        }
      case PdfAnnotationSubtype.FILEATTACHMENT:
        {
          annotation = this.readPdfFileAttachmentAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.INK:
        {
          annotation = this.readPdfInkAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYGON:
        {
          annotation = this.readPdfPolygonAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYLINE:
        {
          annotation = this.readPdfPolylineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINE:
        {
          annotation = this.readPdfLineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.HIGHLIGHT:
        annotation = this.readPdfHighlightAnno(page, annotationPtr, index);
        break;
      case PdfAnnotationSubtype.STAMP:
        {
          annotation = this.readPdfStampAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUARE:
        {
          annotation = this.readPdfSquareAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CIRCLE:
        {
          annotation = this.readPdfCircleAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.UNDERLINE:
        {
          annotation = this.readPdfUnderlineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUIGGLY:
        {
          annotation = this.readPdfSquigglyAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.STRIKEOUT:
        {
          annotation = this.readPdfStrikeOutAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CARET:
        {
          annotation = this.readPdfCaretAnno(page, annotationPtr, index);
        }
        break;
      default:
        {
          annotation = this.readPdfAnno(page, subType, annotationPtr, index);
        }
        break;
    }
    return annotation;
  }
  /**
   * Return the colour stored directly in the annotation dictionary's \`/C\` entry.
   *
   * Most PDFs created by Acrobat, Microsoft Office, LaTeX, etc. include this entry.
   * When the key is absent (common in macOS Preview, Chrome, Drawboard) the call
   * fails and the function returns \`undefined\`.
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @returns An RGBA tuple (0-255 channels) or \`undefined\` if no \`/C\` entry exists
   *
   * @private
   */
  readAnnotationColor(annotationPtr, colorType = PdfAnnotationColorType.Color) {
    const rPtr = this.memoryManager.malloc(4);
    const gPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.EPDFAnnot_GetColor(annotationPtr, colorType, rPtr, gPtr, bPtr);
    let colour;
    if (ok) {
      colour = {
        red: this.pdfiumModule.pdfium.getValue(rPtr, "i32") & 255,
        green: this.pdfiumModule.pdfium.getValue(gPtr, "i32") & 255,
        blue: this.pdfiumModule.pdfium.getValue(bPtr, "i32") & 255
      };
    }
    this.memoryManager.free(rPtr);
    this.memoryManager.free(gPtr);
    this.memoryManager.free(bPtr);
    return colour;
  }
  /**
   * Get the fill/stroke colour annotation.
   *
   * @param annotationPtr - pointer to the annotation whose colour is being set
   * @param colorType - which colour to get (0 = fill, 1 = stroke)
   * @returns WebColor with hex color
   *
   * @private
   */
  getAnnotationColor(annotationPtr, colorType = PdfAnnotationColorType.Color) {
    const annotationColor = this.readAnnotationColor(annotationPtr, colorType);
    return annotationColor ? pdfColorToWebColor(annotationColor) : void 0;
  }
  /**
   * Set the fill/stroke colour for a **Highlight / Underline / StrikeOut / Squiggly** markup annotation.
   *
   * @param annotationPtr - pointer to the annotation whose colour is being set
   * @param webAlphaColor - WebAlphaColor with hex color and opacity (0-1)
   * @param shouldClearAP - whether to clear the /AP entry
   * @param which - which colour to set (0 = fill, 1 = stroke)
   * @returns \`true\` if the operation was successful
   *
   * @private
   */
  setAnnotationColor(annotationPtr, webColor, colorType = PdfAnnotationColorType.Color) {
    const pdfColor = webColorToPdfColor(webColor);
    return this.pdfiumModule.EPDFAnnot_SetColor(
      annotationPtr,
      colorType,
      pdfColor.red & 255,
      pdfColor.green & 255,
      pdfColor.blue & 255
    );
  }
  /**
   * Get the opacity of the annotation.
   *
   * @param annotationPtr - pointer to the annotation whose opacity is being set
   * @returns opacity (0-1)
   *
   * @private
   */
  getAnnotationOpacity(annotationPtr) {
    const opacityPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.EPDFAnnot_GetOpacity(annotationPtr, opacityPtr);
    const opacity = ok ? this.pdfiumModule.pdfium.getValue(opacityPtr, "i32") : 255;
    this.memoryManager.free(opacityPtr);
    return pdfAlphaToWebOpacity(opacity);
  }
  /**
   * Set the opacity of the annotation.
   *
   * @param annotationPtr - pointer to the annotation whose opacity is being set
   * @param opacity - opacity (0-1)
   * @returns true on success
   *
   * @private
   */
  setAnnotationOpacity(annotationPtr, opacity) {
    const pdfOpacity = webOpacityToPdfAlpha(opacity);
    return this.pdfiumModule.EPDFAnnot_SetOpacity(annotationPtr, pdfOpacity & 255);
  }
  /**
   * Fetch the \`/Q\` text-alignment value from a **FreeText** annotation.
   *
   * @param annotationPtr pointer returned by \`FPDFPage_GetAnnot\`
   * @returns \`PdfTextAlignment\`
   */
  getAnnotationTextAlignment(annotationPtr) {
    return this.pdfiumModule.EPDFAnnot_GetTextAlignment(annotationPtr);
  }
  /**
   * Write the \`/Q\` text-alignment value into a **FreeText** annotation
   * and clear the existing appearance stream so it can be regenerated.
   *
   * @param annotationPtr pointer returned by \`FPDFPage_GetAnnot\`
   * @param alignment     \`PdfTextAlignment\`
   * @returns \`true\` on success
   */
  setAnnotationTextAlignment(annotationPtr, alignment) {
    return !!this.pdfiumModule.EPDFAnnot_SetTextAlignment(annotationPtr, alignment);
  }
  /**
   * Fetch the \`/EPDF:VerticalAlignment\` vertical-alignment value from a **FreeText** annotation.
   *
   * @param annotationPtr pointer returned by \`FPDFPage_GetAnnot\`
   * @returns \`PdfVerticalAlignment\`
   */
  getAnnotationVerticalAlignment(annotationPtr) {
    return this.pdfiumModule.EPDFAnnot_GetVerticalAlignment(annotationPtr);
  }
  /**
   * Write the \`/EPDF:VerticalAlignment\` vertical-alignment value into a **FreeText** annotation
   * and clear the existing appearance stream so it can be regenerated.
   *
   * @param annotationPtr pointer returned by \`FPDFPage_GetAnnot\`
   * @param alignment     \`PdfVerticalAlignment\`
   * @returns \`true\` on success
   */
  setAnnotationVerticalAlignment(annotationPtr, alignment) {
    return !!this.pdfiumModule.EPDFAnnot_SetVerticalAlignment(annotationPtr, alignment);
  }
  /**
   * Return the **default appearance** (font, size, colour) declared in the
   * \`/DA\` string of a **FreeText** annotation.
   *
   * @param annotationPtr  pointer to \`FPDF_ANNOTATION\`
   * @returns \`{ font, fontSize, color }\` or \`undefined\` when PDFium returns false
   *
   * NOTE – \`font\` is the raw \`FPDF_STANDARD_FONT\` enum value that PDFium uses
   *        (same range as the C API: 0 = Courier, 12 = ZapfDingbats, …).
   */
  getAnnotationDefaultAppearance(annotationPtr) {
    const fontPtr = this.memoryManager.malloc(4);
    const sizePtr = this.memoryManager.malloc(4);
    const rPtr = this.memoryManager.malloc(4);
    const gPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);
    const ok = !!this.pdfiumModule.EPDFAnnot_GetDefaultAppearance(
      annotationPtr,
      fontPtr,
      sizePtr,
      rPtr,
      gPtr,
      bPtr
    );
    if (!ok) {
      [fontPtr, sizePtr, rPtr, gPtr, bPtr].forEach((p) => this.memoryManager.free(p));
      return;
    }
    const pdf = this.pdfiumModule.pdfium;
    const font = pdf.getValue(fontPtr, "i32");
    const fontSize = pdf.getValue(sizePtr, "float");
    const red = pdf.getValue(rPtr, "i32") & 255;
    const green = pdf.getValue(gPtr, "i32") & 255;
    const blue = pdf.getValue(bPtr, "i32") & 255;
    [fontPtr, sizePtr, rPtr, gPtr, bPtr].forEach((p) => this.memoryManager.free(p));
    return {
      fontFamily: font,
      fontSize,
      fontColor: pdfColorToWebColor({ red, green, blue })
    };
  }
  /**
   * Write a **default appearance** (\`/DA\`) into a FreeText annotation.
   *
   * @param annotationPtr pointer to \`FPDF_ANNOTATION\`
   * @param font          \`FPDF_STANDARD_FONT\` enum value
   * @param fontSize      size in points (≥ 0)
   * @param color         CSS-style \`#rrggbb\` string (alpha ignored)
   * @returns \`true\` on success
   */
  setAnnotationDefaultAppearance(annotationPtr, font, fontSize, color) {
    const { red, green, blue } = webColorToPdfColor(color);
    return !!this.pdfiumModule.EPDFAnnot_SetDefaultAppearance(
      annotationPtr,
      font,
      fontSize,
      red & 255,
      green & 255,
      blue & 255
    );
  }
  /**
   * Border‐style + width helper
   *
   * Tries the new PDFium helper \`EPDFAnnot_GetBorderStyle()\` (patch series
   * 9 July 2025).
   *
   * @param  annotationPtr  pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ ok, style, width }\`
   *          • \`ok\`     – \`true\` when the call succeeded
   *          • \`style\`  – \`PdfAnnotationBorderStyle\` enum
   *          • \`width\`  – stroke-width in points (defaults to 0 pt)
   */
  getBorderStyle(annotationPtr) {
    const widthPtr = this.memoryManager.malloc(4);
    let width = 0;
    let style = PdfAnnotationBorderStyle.UNKNOWN;
    let ok = false;
    style = this.pdfiumModule.EPDFAnnot_GetBorderStyle(annotationPtr, widthPtr);
    width = this.pdfiumModule.pdfium.getValue(widthPtr, "float");
    ok = style !== PdfAnnotationBorderStyle.UNKNOWN;
    this.memoryManager.free(widthPtr);
    return { ok, style, width };
  }
  setBorderStyle(annotationPtr, style, width) {
    return this.pdfiumModule.EPDFAnnot_SetBorderStyle(annotationPtr, style, width);
  }
  /**
   * Get the icon of the annotation
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @returns \`PdfAnnotationIcon\`
   */
  getAnnotationIcon(annotationPtr) {
    return this.pdfiumModule.EPDFAnnot_GetIcon(annotationPtr);
  }
  /**
   * Set the icon of the annotation
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param icon - \`PdfAnnotationIcon\`
   * @returns \`true\` on success
   */
  setAnnotationIcon(annotationPtr, icon) {
    return this.pdfiumModule.EPDFAnnot_SetIcon(annotationPtr, icon);
  }
  /**
   * Border-effect (“cloudy”) helper
   *
   * Calls the new PDFium function \`EPDFAnnot_GetBorderEffect()\` (July 2025).
   *
   * @param  annotationPtr  pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ ok, intensity }\`
   *          • \`ok\`        – \`true\` when the annotation *does* have a
   *                          valid cloudy-border effect
   *          • \`intensity\` – radius/intensity value (0 when \`ok\` is false)
   */
  getBorderEffect(annotationPtr) {
    const intensityPtr = this.memoryManager.malloc(4);
    const ok = !!this.pdfiumModule.EPDFAnnot_GetBorderEffect(annotationPtr, intensityPtr);
    const intensity = ok ? this.pdfiumModule.pdfium.getValue(intensityPtr, "float") : 0;
    this.memoryManager.free(intensityPtr);
    return { ok, intensity };
  }
  /**
   * Rectangle-differences helper ( /RD array on Square / Circle annots )
   *
   * Calls \`EPDFAnnot_GetRectangleDifferences()\` introduced in July 2025.
   *
   * @param  annotationPtr  pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ ok, left, top, right, bottom }\`
   *          • \`ok\`     – \`true\` when the annotation *has* an /RD entry
   *          • the four floats are 0 when \`ok\` is false
   */
  getRectangleDifferences(annotationPtr) {
    const lPtr = this.memoryManager.malloc(4);
    const tPtr = this.memoryManager.malloc(4);
    const rPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);
    const ok = !!this.pdfiumModule.EPDFAnnot_GetRectangleDifferences(
      annotationPtr,
      lPtr,
      tPtr,
      rPtr,
      bPtr
    );
    const pdf = this.pdfiumModule.pdfium;
    const left = pdf.getValue(lPtr, "float");
    const top = pdf.getValue(tPtr, "float");
    const right = pdf.getValue(rPtr, "float");
    const bottom = pdf.getValue(bPtr, "float");
    this.memoryManager.free(lPtr);
    this.memoryManager.free(tPtr);
    this.memoryManager.free(rPtr);
    this.memoryManager.free(bPtr);
    return { ok, left, top, right, bottom };
  }
  /**
   * Get the date of the annotation
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param key - 'M' for modified date, 'CreationDate' for creation date
   * @returns \`Date\` or \`undefined\` when PDFium can't read the date
   */
  getAnnotationDate(annotationPtr, key) {
    const raw = this.getAnnotString(annotationPtr, key);
    return raw ? pdfDateToDate(raw) : void 0;
  }
  /**
   * Set the date of the annotation
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param key - 'M' for modified date, 'CreationDate' for creation date
   * @param date - \`Date\` to set
   * @returns \`true\` on success
   */
  setAnnotationDate(annotationPtr, key, date) {
    const raw = dateToPdfDate(date);
    return this.setAnnotString(annotationPtr, key, raw);
  }
  /**
   * Get the date of the attachment
   *
   * @param attachmentPtr - pointer to an \`FPDF_ATTACHMENT\`
   * @param key - 'ModDate' for modified date, 'CreationDate' for creation date
   * @returns \`Date\` or \`undefined\` when PDFium can't read the date
   */
  getAttachmentDate(attachmentPtr, key) {
    const raw = this.getAttachmentString(attachmentPtr, key);
    return raw ? pdfDateToDate(raw) : void 0;
  }
  /**
   * Set the date of the attachment
   *
   * @param attachmentPtr - pointer to an \`FPDF_ATTACHMENT\`
   * @param key - 'ModDate' for modified date, 'CreationDate' for creation date
   * @param date - \`Date\` to set
   * @returns \`true\` on success
   */
  setAttachmentDate(attachmentPtr, key, date) {
    const raw = dateToPdfDate(date);
    return this.setAttachmentString(attachmentPtr, key, raw);
  }
  /**
   * Dash-pattern helper ( /BS → /D array, dashed borders only )
   *
   * Uses the two new PDFium helpers:
   *   • \`EPDFAnnot_GetBorderDashPatternCount\`
   *   • \`EPDFAnnot_GetBorderDashPattern\`
   *
   * @param  annotationPtr  pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ ok, pattern }\`
   *          • \`ok\`       – \`true\` when the annot is dashed *and* the array
   *                          was retrieved successfully
   *          • \`pattern\`  – numeric array of dash/space lengths (empty when \`ok\` is false)
   */
  getBorderDashPattern(annotationPtr) {
    const count = this.pdfiumModule.EPDFAnnot_GetBorderDashPatternCount(annotationPtr);
    if (count === 0) {
      return { ok: false, pattern: [] };
    }
    const arrPtr = this.memoryManager.malloc(4 * count);
    const okNative = !!this.pdfiumModule.EPDFAnnot_GetBorderDashPattern(
      annotationPtr,
      arrPtr,
      count
    );
    const pattern = [];
    if (okNative) {
      const pdf = this.pdfiumModule.pdfium;
      for (let i = 0; i < count; i++) {
        pattern.push(pdf.getValue(arrPtr + 4 * i, "float"));
      }
    }
    this.memoryManager.free(arrPtr);
    return { ok: okNative, pattern };
  }
  /**
   * Write the /BS /D dash pattern array for an annotation border.
   *
   * @param annotationPtr Pointer to FPDF_ANNOTATION
   * @param pattern       Array of dash/space lengths in *points* (e.g. [3, 2])
   *                      Empty array clears the pattern (solid line).
   * @returns true on success
   *
   * @private
   */
  setBorderDashPattern(annotationPtr, pattern) {
    if (!pattern || pattern.length === 0) {
      return this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(annotationPtr, 0, 0);
    }
    const clean = pattern.map((n) => Number.isFinite(n) && n > 0 ? n : 0).filter((n) => n > 0);
    if (clean.length === 0) {
      return this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(annotationPtr, 0, 0);
    }
    const bytes = 4 * clean.length;
    const bufPtr = this.memoryManager.malloc(bytes);
    for (let i = 0; i < clean.length; i++) {
      this.pdfiumModule.pdfium.setValue(bufPtr + 4 * i, clean[i], "float");
    }
    const ok = !!this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(
      annotationPtr,
      bufPtr,
      clean.length
    );
    this.memoryManager.free(bufPtr);
    return ok;
  }
  /**
   * Return the \`/LE\` array (start/end line-ending styles) for a LINE / POLYLINE annot.
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ start, end }\` or \`undefined\` when PDFium can't read them
   *
   * @private
   */
  getLineEndings(annotationPtr) {
    const startPtr = this.memoryManager.malloc(4);
    const endPtr = this.memoryManager.malloc(4);
    const ok = !!this.pdfiumModule.EPDFAnnot_GetLineEndings(annotationPtr, startPtr, endPtr);
    if (!ok) {
      this.memoryManager.free(startPtr);
      this.memoryManager.free(endPtr);
      return void 0;
    }
    const start = this.pdfiumModule.pdfium.getValue(startPtr, "i32");
    const end = this.pdfiumModule.pdfium.getValue(endPtr, "i32");
    this.memoryManager.free(startPtr);
    this.memoryManager.free(endPtr);
    return { start, end };
  }
  /**
   * Write the \`/LE\` array (start/end line-ending styles) for a LINE / POLYLINE annot.
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param start - start line ending style
   * @param end - end line ending style
   * @returns \`true\` on success
   */
  setLineEndings(annotationPtr, start, end) {
    return !!this.pdfiumModule.EPDFAnnot_SetLineEndings(annotationPtr, start, end);
  }
  /**
   * Get the start and end points of a LINE / POLYLINE annot.
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param page - logical page info object (\`PdfPageObject\`)
   * @returns \`{ start, end }\` or \`undefined\` when PDFium can't read them
   */
  getLinePoints(page, annotationPtr) {
    const startPtr = this.memoryManager.malloc(8);
    const endPtr = this.memoryManager.malloc(8);
    const ok = this.pdfiumModule.FPDFAnnot_GetLine(annotationPtr, startPtr, endPtr);
    if (!ok) {
      this.memoryManager.free(startPtr);
      this.memoryManager.free(endPtr);
      return void 0;
    }
    const pdf = this.pdfiumModule.pdfium;
    const sx = pdf.getValue(startPtr + 0, "float");
    const sy = pdf.getValue(startPtr + 4, "float");
    const ex = pdf.getValue(endPtr + 0, "float");
    const ey = pdf.getValue(endPtr + 4, "float");
    this.memoryManager.free(startPtr);
    this.memoryManager.free(endPtr);
    const start = this.convertPagePointToDevicePoint(page, { x: sx, y: sy });
    const end = this.convertPagePointToDevicePoint(page, { x: ex, y: ey });
    return { start, end };
  }
  /**
   * Set the two end‑points of a **Line** annotation
   * by writing a new /L array \`[ x1 y1 x2 y2 ]\`.
   * @param page - logical page info object (\`PdfPageObject\`)
   * @param annotPtr - pointer to the annotation whose line points are needed
   * @param start - start point
   * @param end - end point
   * @returns true on success
   */
  setLinePoints(page, annotPtr, start, end) {
    const p1 = this.convertDevicePointToPagePoint(page, start);
    const p2 = this.convertDevicePointToPagePoint(page, end);
    if (!p1 || !p2) return false;
    const buf = this.memoryManager.malloc(16);
    const pdf = this.pdfiumModule.pdfium;
    pdf.setValue(buf + 0, p1.x, "float");
    pdf.setValue(buf + 4, p1.y, "float");
    pdf.setValue(buf + 8, p2.x, "float");
    pdf.setValue(buf + 12, p2.y, "float");
    const ok = this.pdfiumModule.EPDFAnnot_SetLine(annotPtr, buf, buf + 8);
    this.memoryManager.free(buf);
    return !!ok;
  }
  /**
   * Read \`/QuadPoints\` from any annotation and convert each quadrilateral to
   * device-space coordinates.
   *
   * The four points are returned in natural reading order:
   *   \`p1 → p2\` (top edge) and \`p4 → p3\` (bottom edge).
   * This preserves the true shape for rotated / skewed text, whereas callers
   * that only need axis-aligned boxes can collapse each quad themselves.
   *
   * @param page          - logical page info object (\`PdfPageObject\`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @returns Array of \`Rect\` objects (\`[]\` if the annotation has no quads)
   *
   * @private
   */
  getQuadPointsAnno(page, annotationPtr) {
    const quadCount = this.pdfiumModule.FPDFAnnot_CountAttachmentPoints(annotationPtr);
    if (quadCount === 0) return [];
    const FS_QUADPOINTSF_SIZE = 8 * 4;
    const quads = [];
    for (let qi = 0; qi < quadCount; qi++) {
      const quadPtr = this.memoryManager.malloc(FS_QUADPOINTSF_SIZE);
      const ok = this.pdfiumModule.FPDFAnnot_GetAttachmentPoints(annotationPtr, qi, quadPtr);
      if (ok) {
        const xs = [];
        const ys = [];
        for (let i = 0; i < 4; i++) {
          const base = quadPtr + i * 8;
          xs.push(this.pdfiumModule.pdfium.getValue(base, "float"));
          ys.push(this.pdfiumModule.pdfium.getValue(base + 4, "float"));
        }
        const p1 = this.convertPagePointToDevicePoint(page, { x: xs[0], y: ys[0] });
        const p2 = this.convertPagePointToDevicePoint(page, { x: xs[1], y: ys[1] });
        const p3 = this.convertPagePointToDevicePoint(page, { x: xs[2], y: ys[2] });
        const p4 = this.convertPagePointToDevicePoint(page, { x: xs[3], y: ys[3] });
        quads.push({ p1, p2, p3, p4 });
      }
      this.memoryManager.free(quadPtr);
    }
    return quads.map(quadToRect);
  }
  /**
   * Set the quadrilaterals for a **Highlight / Underline / StrikeOut / Squiggly** markup annotation.
   *
   * @param page          - logical page info object (\`PdfPageObject\`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @param rects         - array of \`Rect\` objects (\`[]\` if the annotation has no quads)
   * @returns \`true\` if the operation was successful
   *
   * @private
   */
  syncQuadPointsAnno(page, annotPtr, rects) {
    const FS_QUADPOINTSF_SIZE = 8 * 4;
    const pdf = this.pdfiumModule.pdfium;
    const count = this.pdfiumModule.FPDFAnnot_CountAttachmentPoints(annotPtr);
    const buf = this.memoryManager.malloc(FS_QUADPOINTSF_SIZE);
    const writeQuad = (r) => {
      const q = rectToQuad(r);
      const p1 = this.convertDevicePointToPagePoint(page, q.p1);
      const p2 = this.convertDevicePointToPagePoint(page, q.p2);
      const p3 = this.convertDevicePointToPagePoint(page, q.p3);
      const p4 = this.convertDevicePointToPagePoint(page, q.p4);
      pdf.setValue(buf + 0, p1.x, "float");
      pdf.setValue(buf + 4, p1.y, "float");
      pdf.setValue(buf + 8, p2.x, "float");
      pdf.setValue(buf + 12, p2.y, "float");
      pdf.setValue(buf + 16, p4.x, "float");
      pdf.setValue(buf + 20, p4.y, "float");
      pdf.setValue(buf + 24, p3.x, "float");
      pdf.setValue(buf + 28, p3.y, "float");
    };
    const min = Math.min(count, rects.length);
    for (let i = 0; i < min; i++) {
      writeQuad(rects[i]);
      if (!this.pdfiumModule.FPDFAnnot_SetAttachmentPoints(annotPtr, i, buf)) {
        this.memoryManager.free(buf);
        return false;
      }
    }
    for (let i = count; i < rects.length; i++) {
      writeQuad(rects[i]);
      if (!this.pdfiumModule.FPDFAnnot_AppendAttachmentPoints(annotPtr, buf)) {
        this.memoryManager.free(buf);
        return false;
      }
    }
    this.memoryManager.free(buf);
    return true;
  }
  /**
   * Redact text that intersects ANY of the provided **quads** (device-space).
   * Returns \`true\` if the page changed. Always regenerates the page stream.
   */
  redactTextInRects(doc, page, rects, options) {
    const { recurseForms = true, drawBlackBoxes = false } = options ?? {};
    this.logger.debug(
      "PDFiumEngine",
      "Engine",
      "redactTextInQuads",
      doc.id,
      page.index,
      rects.length
    );
    const label = "RedactTextInQuads";
    this.logger.perf("PDFiumEngine", "Engine", label, "Begin", \`\${doc.id}-\${page.index}\`);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf("PDFiumEngine", "Engine", label, "End", \`\${doc.id}-\${page.index}\`);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const clean = (rects ?? []).filter(
      (r) => {
        var _a, _b, _c, _d;
        return r && Number.isFinite((_a = r.origin) == null ? void 0 : _a.x) && Number.isFinite((_b = r.origin) == null ? void 0 : _b.y) && Number.isFinite((_c = r.size) == null ? void 0 : _c.width) && Number.isFinite((_d = r.size) == null ? void 0 : _d.height) && r.size.width > 0 && r.size.height > 0;
      }
    );
    if (clean.length === 0) {
      this.logger.perf("PDFiumEngine", "Engine", label, "End", \`\${doc.id}-\${page.index}\`);
      return PdfTaskHelper.resolve(false);
    }
    const pageCtx = ctx.acquirePage(page.index);
    const { ptr, count } = this.allocFSQuadsBufferFromRects(page, clean);
    let ok = false;
    try {
      ok = !!this.pdfiumModule.EPDFText_RedactInQuads(
        pageCtx.pagePtr,
        ptr,
        count,
        recurseForms ? true : false,
        drawBlackBoxes ? true : false
      );
    } finally {
      this.memoryManager.free(ptr);
    }
    if (ok) {
      ok = !!this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }
    pageCtx.disposeImmediate();
    this.logger.perf("PDFiumEngine", "Engine", label, "End", \`\${doc.id}-\${page.index}\`);
    return PdfTaskHelper.resolve(!!ok);
  }
  /** Pack device-space Rects into an FS_QUADPOINTSF[] buffer (page space). */
  allocFSQuadsBufferFromRects(page, rects) {
    const STRIDE = 32;
    const count = rects.length;
    const ptr = this.memoryManager.malloc(STRIDE * count);
    const pdf = this.pdfiumModule.pdfium;
    for (let i = 0; i < count; i++) {
      const r = rects[i];
      const q = rectToQuad(r);
      const p1 = this.convertDevicePointToPagePoint(page, q.p1);
      const p2 = this.convertDevicePointToPagePoint(page, q.p2);
      const p3 = this.convertDevicePointToPagePoint(page, q.p3);
      const p4 = this.convertDevicePointToPagePoint(page, q.p4);
      const base = ptr + i * STRIDE;
      pdf.setValue(base + 0, p1.x, "float");
      pdf.setValue(base + 4, p1.y, "float");
      pdf.setValue(base + 8, p2.x, "float");
      pdf.setValue(base + 12, p2.y, "float");
      pdf.setValue(base + 16, p4.x, "float");
      pdf.setValue(base + 20, p4.y, "float");
      pdf.setValue(base + 24, p3.x, "float");
      pdf.setValue(base + 28, p3.y, "float");
    }
    return { ptr, count };
  }
  /**
   * Read ink list from annotation
   * @param page  - logical page info object (\`PdfPageObject\`)
   * @param pagePtr - pointer to the page
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @returns ink list
   */
  getInkList(page, annotationPtr) {
    const inkList = [];
    const pathCount = this.pdfiumModule.FPDFAnnot_GetInkListCount(annotationPtr);
    if (pathCount <= 0) return inkList;
    const pdf = this.pdfiumModule.pdfium;
    const POINT_STRIDE = 8;
    for (let i = 0; i < pathCount; i++) {
      const points = [];
      const n = this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, 0, 0);
      if (n > 0) {
        const buf = this.memoryManager.malloc(n * POINT_STRIDE);
        this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, buf, n);
        for (let j = 0; j < n; j++) {
          const base = buf + j * POINT_STRIDE;
          const px = pdf.getValue(base + 0, "float");
          const py = pdf.getValue(base + 4, "float");
          const d = this.convertPagePointToDevicePoint(page, { x: px, y: py });
          points.push({ x: d.x, y: d.y });
        }
        this.memoryManager.free(buf);
      }
      inkList.push({ points });
    }
    return inkList;
  }
  /**
   * Add ink list to annotation
   * @param page  - logical page info object (\`PdfPageObject\`)
   * @param pagePtr - pointer to the page
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @param inkList - ink list array of \`PdfInkListObject\`
   * @returns \`true\` if the operation was successful
   */
  setInkList(page, annotationPtr, inkList) {
    const pdf = this.pdfiumModule.pdfium;
    const POINT_STRIDE = 8;
    for (const stroke of inkList) {
      const n = stroke.points.length;
      if (n === 0) continue;
      const buf = this.memoryManager.malloc(n * POINT_STRIDE);
      for (let i = 0; i < n; i++) {
        const pDev = stroke.points[i];
        const pPage = this.convertDevicePointToPagePoint(page, pDev);
        pdf.setValue(buf + i * POINT_STRIDE + 0, pPage.x, "float");
        pdf.setValue(buf + i * POINT_STRIDE + 4, pPage.y, "float");
      }
      const idx = this.pdfiumModule.FPDFAnnot_AddInkStroke(annotationPtr, buf, n);
      this.memoryManager.free(buf);
      if (idx === -1) {
        return false;
      }
    }
    return true;
  }
  /**
   * Read pdf text annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf text annotation
   *
   * @private
   */
  readPdfTextAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const state = this.getAnnotString(annotationPtr, "State");
    const stateModel = this.getAnnotString(annotationPtr, "StateModel");
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const inReplyToId = this.getInReplyToId(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const icon = this.getAnnotationIcon(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.TEXT,
      flags,
      contents,
      color: color ?? "#FFFF00",
      opacity,
      rect,
      inReplyToId,
      author,
      modified,
      created,
      state,
      stateModel,
      icon
    };
  }
  /**
   * Read pdf freetext annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf freetext annotation
   *
   * @private
   */
  readPdfFreeTextAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const defaultStyle = this.getAnnotString(annotationPtr, "DS");
    const da = this.getAnnotationDefaultAppearance(annotationPtr);
    const backgroundColor = this.getAnnotationColor(annotationPtr);
    const textAlign = this.getAnnotationTextAlignment(annotationPtr);
    const verticalAlign = this.getAnnotationVerticalAlignment(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const richContent = this.getAnnotRichContent(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.FREETEXT,
      fontFamily: (da == null ? void 0 : da.fontFamily) ?? PdfStandardFont.Unknown,
      fontSize: (da == null ? void 0 : da.fontSize) ?? 12,
      fontColor: (da == null ? void 0 : da.fontColor) ?? "#000000",
      verticalAlign,
      backgroundColor,
      flags,
      opacity,
      textAlign,
      defaultStyle,
      richContent,
      contents,
      author,
      modified,
      created,
      rect
    };
  }
  /**
   * Read pdf link annotation from pdf document
   * @param page  - pdf page infor
   * @param docPtr - pointer to pdf document object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf link annotation
   *
   * @private
   */
  readPdfLinkAnno(page, docPtr, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const linkPtr = this.pdfiumModule.FPDFAnnot_GetLink(annotationPtr);
    if (!linkPtr) {
      return;
    }
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    const target = this.readPdfLinkAnnoTarget(
      docPtr,
      () => {
        return this.pdfiumModule.FPDFLink_GetAction(linkPtr);
      },
      () => {
        return this.pdfiumModule.FPDFLink_GetDest(docPtr, linkPtr);
      }
    );
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.LINK,
      flags,
      target,
      rect,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf widget annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param formHandle - form handle
   * @param index  - index of annotation in the pdf page
   * @returns pdf widget annotation
   *
   * @private
   */
  readPdfWidgetAnno(page, annotationPtr, formHandle, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    const field = this.readPdfWidgetAnnoField(formHandle, annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.WIDGET,
      flags,
      rect,
      field,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf file attachment annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf file attachment annotation
   *
   * @private
   */
  readPdfFileAttachmentAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.FILEATTACHMENT,
      flags,
      rect,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf ink annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf ink annotation
   *
   * @private
   */
  readPdfInkAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { width: strokeWidth } = this.getBorderStyle(annotationPtr);
    const inkList = this.getInkList(page, annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const intent = this.getAnnotIntent(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.INK,
      ...intent && { intent },
      contents,
      blendMode,
      flags,
      color: color ?? "#FF0000",
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      rect,
      inkList,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf polygon annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polygon annotation
   *
   * @private
   */
  readPdfPolygonAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const vertices = this.readPdfAnnoVertices(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const flags = this.getAnnotationFlags(annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);
    let strokeDashArray;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    if (vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first.x === last.x && first.y === last.y) {
        vertices.pop();
      }
    }
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.POLYGON,
      contents,
      flags,
      strokeColor: strokeColor ?? "#FF0000",
      color: interiorColor ?? "transparent",
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      rect,
      vertices,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf polyline annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polyline annotation
   *
   * @private
   */
  readPdfPolylineAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const vertices = this.readPdfAnnoVertices(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);
    let strokeDashArray;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    const lineEndings = this.getLineEndings(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.POLYLINE,
      contents,
      flags,
      strokeColor: strokeColor ?? "#FF0000",
      color: interiorColor ?? "transparent",
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      lineEndings,
      rect,
      vertices,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf line annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf line annotation
   *
   * @private
   */
  readPdfLineAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const linePoints = this.getLinePoints(page, annotationPtr);
    const lineEndings = this.getLineEndings(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);
    let strokeDashArray;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.LINE,
      flags,
      rect,
      contents,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      strokeColor: strokeColor ?? "#FF0000",
      color: interiorColor ?? "transparent",
      opacity,
      linePoints: linePoints || { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      lineEndings: lineEndings || {
        start: PdfAnnotationLineEnding.None,
        end: PdfAnnotationLineEnding.None
      },
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf highlight annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf highlight annotation
   *
   * @private
   */
  readPdfHighlightAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? "#FFFF00",
      opacity,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf underline annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf underline annotation
   *
   * @private
   */
  readPdfUnderlineAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.UNDERLINE,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? "#FF0000",
      opacity,
      author,
      modified,
      created
    };
  }
  /**
   * Read strikeout annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf strikeout annotation
   *
   * @private
   */
  readPdfStrikeOutAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.STRIKEOUT,
      flags,
      rect,
      contents,
      segmentRects,
      color: color ?? "#FF0000",
      opacity,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf squiggly annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf squiggly annotation
   *
   * @private
   */
  readPdfSquigglyAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.SQUIGGLY,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? "#FF0000",
      opacity,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf caret annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf caret annotation
   *
   * @private
   */
  readPdfCaretAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.CARET,
      rect,
      flags,
      author,
      modified,
      created
    };
  }
  /**
   * Read pdf stamp annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf stamp annotation
   *
   * @private
   */
  readPdfStampAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.STAMP,
      contents,
      rect,
      author,
      modified,
      created,
      flags
    };
  }
  /**
   * Read pdf object in pdf page
   * @param pageObjectPtr  - pointer to pdf object in page
   * @returns pdf object in page
   *
   * @private
   */
  readPdfPageObject(pageObjectPtr) {
    const type = this.pdfiumModule.FPDFPageObj_GetType(pageObjectPtr);
    switch (type) {
      case PdfPageObjectType.PATH:
        return this.readPathObject(pageObjectPtr);
      case PdfPageObjectType.IMAGE:
        return this.readImageObject(pageObjectPtr);
      case PdfPageObjectType.FORM:
        return this.readFormObject(pageObjectPtr);
    }
  }
  /**
   * Read pdf path object
   * @param pathObjectPtr  - pointer to pdf path object in page
   * @returns pdf path object
   *
   * @private
   */
  readPathObject(pathObjectPtr) {
    const segmentCount = this.pdfiumModule.FPDFPath_CountSegments(pathObjectPtr);
    const leftPtr = this.memoryManager.malloc(4);
    const bottomPtr = this.memoryManager.malloc(4);
    const rightPtr = this.memoryManager.malloc(4);
    const topPtr = this.memoryManager.malloc(4);
    this.pdfiumModule.FPDFPageObj_GetBounds(pathObjectPtr, leftPtr, bottomPtr, rightPtr, topPtr);
    const left = this.pdfiumModule.pdfium.getValue(leftPtr, "float");
    const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, "float");
    const right = this.pdfiumModule.pdfium.getValue(rightPtr, "float");
    const top = this.pdfiumModule.pdfium.getValue(topPtr, "float");
    const bounds = { left, bottom, right, top };
    this.memoryManager.free(leftPtr);
    this.memoryManager.free(bottomPtr);
    this.memoryManager.free(rightPtr);
    this.memoryManager.free(topPtr);
    const segments = [];
    for (let i = 0; i < segmentCount; i++) {
      const segment = this.readPdfSegment(pathObjectPtr, i);
      segments.push(segment);
    }
    const matrix = this.readPdfPageObjectTransformMatrix(pathObjectPtr);
    return {
      type: PdfPageObjectType.PATH,
      bounds,
      segments,
      matrix
    };
  }
  /**
   * Read segment of pdf path object
   * @param annotationObjectPtr - pointer to pdf path object
   * @param segmentIndex - index of segment
   * @returns pdf segment in pdf path
   *
   * @private
   */
  readPdfSegment(annotationObjectPtr, segmentIndex) {
    const segmentPtr = this.pdfiumModule.FPDFPath_GetPathSegment(annotationObjectPtr, segmentIndex);
    const segmentType = this.pdfiumModule.FPDFPathSegment_GetType(segmentPtr);
    const isClosed = this.pdfiumModule.FPDFPathSegment_GetClose(segmentPtr);
    const pointXPtr = this.memoryManager.malloc(4);
    const pointYPtr = this.memoryManager.malloc(4);
    this.pdfiumModule.FPDFPathSegment_GetPoint(segmentPtr, pointXPtr, pointYPtr);
    const pointX = this.pdfiumModule.pdfium.getValue(pointXPtr, "float");
    const pointY = this.pdfiumModule.pdfium.getValue(pointYPtr, "float");
    this.memoryManager.free(pointXPtr);
    this.memoryManager.free(pointYPtr);
    return {
      type: segmentType,
      point: { x: pointX, y: pointY },
      isClosed
    };
  }
  /**
   * Read pdf image object from pdf document
   * @param pageObjectPtr  - pointer to pdf image object in page
   * @returns pdf image object
   *
   * @private
   */
  readImageObject(imageObjectPtr) {
    const bitmapPtr = this.pdfiumModule.FPDFImageObj_GetBitmap(imageObjectPtr);
    const bitmapBufferPtr = this.pdfiumModule.FPDFBitmap_GetBuffer(bitmapPtr);
    const bitmapWidth = this.pdfiumModule.FPDFBitmap_GetWidth(bitmapPtr);
    const bitmapHeight = this.pdfiumModule.FPDFBitmap_GetHeight(bitmapPtr);
    const format = this.pdfiumModule.FPDFBitmap_GetFormat(bitmapPtr);
    const pixelCount = bitmapWidth * bitmapHeight;
    const bytesPerPixel = 4;
    const array = new Uint8ClampedArray(pixelCount * bytesPerPixel);
    for (let i = 0; i < pixelCount; i++) {
      switch (format) {
        case 2:
          {
            const blue = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3, "i8");
            const green = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3 + 1, "i8");
            const red = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3 + 2, "i8");
            array[i * bytesPerPixel] = red;
            array[i * bytesPerPixel + 1] = green;
            array[i * bytesPerPixel + 2] = blue;
            array[i * bytesPerPixel + 3] = 100;
          }
          break;
      }
    }
    const imageData = new ImageData(array, bitmapWidth, bitmapHeight);
    const matrix = this.readPdfPageObjectTransformMatrix(imageObjectPtr);
    return {
      type: PdfPageObjectType.IMAGE,
      imageData,
      matrix
    };
  }
  /**
   * Read form object from pdf document
   * @param formObjectPtr  - pointer to pdf form object in page
   * @returns pdf form object
   *
   * @private
   */
  readFormObject(formObjectPtr) {
    const objectCount = this.pdfiumModule.FPDFFormObj_CountObjects(formObjectPtr);
    const objects = [];
    for (let i = 0; i < objectCount; i++) {
      const pageObjectPtr = this.pdfiumModule.FPDFFormObj_GetObject(formObjectPtr, i);
      const pageObj = this.readPdfPageObject(pageObjectPtr);
      if (pageObj) {
        objects.push(pageObj);
      }
    }
    const matrix = this.readPdfPageObjectTransformMatrix(formObjectPtr);
    return {
      type: PdfPageObjectType.FORM,
      objects,
      matrix
    };
  }
  /**
   * Read pdf object in pdf page
   * @param pageObjectPtr  - pointer to pdf object in page
   * @returns pdf object in page
   *
   * @private
   */
  readPdfPageObjectTransformMatrix(pageObjectPtr) {
    const matrixPtr = this.memoryManager.malloc(4 * 6);
    if (this.pdfiumModule.FPDFPageObj_GetMatrix(pageObjectPtr, matrixPtr)) {
      const a = this.pdfiumModule.pdfium.getValue(matrixPtr, "float");
      const b = this.pdfiumModule.pdfium.getValue(matrixPtr + 4, "float");
      const c = this.pdfiumModule.pdfium.getValue(matrixPtr + 8, "float");
      const d = this.pdfiumModule.pdfium.getValue(matrixPtr + 12, "float");
      const e = this.pdfiumModule.pdfium.getValue(matrixPtr + 16, "float");
      const f = this.pdfiumModule.pdfium.getValue(matrixPtr + 20, "float");
      this.memoryManager.free(matrixPtr);
      return { a, b, c, d, e, f };
    }
    this.memoryManager.free(matrixPtr);
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  /**
   * Read contents of a stamp annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns contents of the stamp annotation
   *
   * @private
   */
  readStampAnnotationContents(annotationPtr) {
    const contents = [];
    const objectCount = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr);
    for (let i = 0; i < objectCount; i++) {
      const annotationObjectPtr = this.pdfiumModule.FPDFAnnot_GetObject(annotationPtr, i);
      const pageObj = this.readPdfPageObject(annotationObjectPtr);
      if (pageObj) {
        contents.push(pageObj);
      }
    }
    return contents;
  }
  /**
   * Return the stroke-width declared in the annotation’s /Border or /BS entry.
   * Falls back to 1 pt when nothing is defined.
   *
   * @param annotationPtr - pointer to pdf annotation
   * @returns stroke-width
   *
   * @private
   */
  getStrokeWidth(annotationPtr) {
    const hPtr = this.memoryManager.malloc(4);
    const vPtr = this.memoryManager.malloc(4);
    const wPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.FPDFAnnot_GetBorder(annotationPtr, hPtr, vPtr, wPtr);
    const width = ok ? this.pdfiumModule.pdfium.getValue(wPtr, "float") : 1;
    this.memoryManager.free(hPtr);
    this.memoryManager.free(vPtr);
    this.memoryManager.free(wPtr);
    return width;
  }
  /**
   * Fetches the \`/F\` flag bit-field from an annotation.
   *
   * @param annotationPtr pointer to an \`FPDF_ANNOTATION\`
   * @returns \`{ raw, flags }\`
   *          • \`raw\`   – the 32-bit integer returned by PDFium
   *          • \`flags\` – object with individual booleans
   */
  getAnnotationFlags(annotationPtr) {
    const rawFlags = this.pdfiumModule.FPDFAnnot_GetFlags(annotationPtr);
    return flagsToNames(rawFlags);
  }
  setAnnotationFlags(annotationPtr, flags) {
    const rawFlags = namesToFlags(flags);
    return this.pdfiumModule.FPDFAnnot_SetFlags(annotationPtr, rawFlags);
  }
  /**
   * Read circle annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf circle annotation
   *
   * @private
   */
  readPdfCircleAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);
    let strokeDashArray;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.CIRCLE,
      flags,
      color: interiorColor ?? "transparent",
      opacity,
      contents,
      strokeWidth,
      strokeColor: strokeColor ?? "#FF0000",
      strokeStyle,
      rect,
      author,
      modified,
      created,
      ...strokeDashArray !== void 0 && { strokeDashArray }
    };
  }
  /**
   * Read square annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf square annotation
   *
   * @private
   */
  readPdfSquareAnno(page, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const contents = this.getAnnotString(annotationPtr, "Contents") || "";
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);
    let strokeDashArray;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.SQUARE,
      flags,
      color: interiorColor ?? "transparent",
      opacity,
      contents,
      strokeColor: strokeColor ?? "#FF0000",
      strokeWidth,
      strokeStyle,
      rect,
      author,
      modified,
      created,
      ...strokeDashArray !== void 0 && { strokeDashArray }
    };
  }
  /**
   * Read basic info of unsupported pdf annotation
   * @param page  - pdf page infor
   * @param type - type of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf annotation
   *
   * @private
   */
  readPdfAnno(page, type, annotationPtr, index) {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, "T");
    const modified = this.getAnnotationDate(annotationPtr, "M");
    const created = this.getAnnotationDate(annotationPtr, "CreationDate");
    const flags = this.getAnnotationFlags(annotationPtr);
    return {
      pageIndex: page.index,
      custom,
      id: index,
      flags,
      type,
      rect,
      author,
      modified,
      created
    };
  }
  /**
   * Resolve \`/IRT\` → parent-annotation index on the same page.
   *
   * @param pagePtr        - pointer to FPDF_PAGE
   * @param annotationPtr  - pointer to FPDF_ANNOTATION
   * @returns index (\`0…count-1\`) or \`undefined\` when the annotation is *not* a reply
   *
   * @private
   */
  getInReplyToId(annotationPtr) {
    const parentPtr = this.pdfiumModule.FPDFAnnot_GetLinkedAnnot(annotationPtr, "IRT");
    if (!parentPtr) return;
    return this.getAnnotString(parentPtr, "NM");
  }
  /**
   * Set the in reply to id of the annotation
   *
   * @param annotationPtr - pointer to an \`FPDF_ANNOTATION\`
   * @param id - the id of the parent annotation
   * @returns \`true\` on success
   */
  setInReplyToId(pagePtr, annotationPtr, id) {
    const parentPtr = this.getAnnotationByName(pagePtr, id);
    if (!parentPtr) return false;
    return this.pdfiumModule.EPDFAnnot_SetLinkedAnnot(annotationPtr, "IRT", parentPtr);
  }
  /**
   * Fetch a string value (\`/T\`, \`/M\`, \`/State\`, …) from an annotation.
   *
   * @returns decoded UTF-8 string or \`undefined\` when the key is absent
   *
   * @private
   */
  getAnnotString(annotationPtr, key) {
    const len = this.pdfiumModule.FPDFAnnot_GetStringValue(annotationPtr, key, 0, 0);
    if (len === 0) return;
    const bytes = (len + 1) * 2;
    const ptr = this.memoryManager.malloc(bytes);
    this.pdfiumModule.FPDFAnnot_GetStringValue(annotationPtr, key, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);
    return value || void 0;
  }
  /**
   * Get a string value (\`/T\`, \`/M\`, \`/State\`, …) from an attachment.
   *
   * @returns decoded UTF-8 string or \`undefined\` when the key is absent
   *
   * @private
   */
  getAttachmentString(attachmentPtr, key) {
    const len = this.pdfiumModule.FPDFAttachment_GetStringValue(attachmentPtr, key, 0, 0);
    if (len === 0) return;
    const bytes = (len + 1) * 2;
    const ptr = this.memoryManager.malloc(bytes);
    this.pdfiumModule.FPDFAttachment_GetStringValue(attachmentPtr, key, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);
    return value || void 0;
  }
  /**
   * Get a number value (\`/Size\`) from an attachment.
   *
   * @returns number or \`null\` when the key is absent
   *
   * @private
   */
  getAttachmentNumber(attachmentPtr, key) {
    const outPtr = this.memoryManager.malloc(4);
    try {
      const ok = this.pdfiumModule.EPDFAttachment_GetIntegerValue(
        attachmentPtr,
        key,
        // FPDF_BYTESTRING → ASCII JS string is fine in your glue
        outPtr
      );
      if (!ok) return void 0;
      return this.pdfiumModule.pdfium.getValue(outPtr, "i32") >>> 0;
    } finally {
      this.memoryManager.free(outPtr);
    }
  }
  /**
   * Get custom data of the annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns custom data of the annotation
   *
   * @private
   */
  getAnnotCustom(annotationPtr) {
    const custom = this.getAnnotString(annotationPtr, "EPDFCustom");
    if (!custom) return;
    try {
      return JSON.parse(custom);
    } catch (error) {
      console.warn("Failed to parse annotation custom data as JSON:", error);
      console.warn("Invalid JSON string:", custom);
      return void 0;
    }
  }
  /**
   * Sets custom data for an annotation by safely stringifying and storing JSON
   * @private
   */
  setAnnotCustom(annotationPtr, data) {
    if (data === void 0 || data === null) {
      return this.setAnnotString(annotationPtr, "EPDFCustom", "");
    }
    try {
      const jsonString = JSON.stringify(data);
      return this.setAnnotString(annotationPtr, "EPDFCustom", jsonString);
    } catch (error) {
      console.warn("Failed to stringify annotation custom data as JSON:", error);
      console.warn("Invalid data object:", data);
      return false;
    }
  }
  /**
   * Fetches the /IT (Intent) name from an annotation as a UTF-8 JS string.
   *
   * Mirrors getAnnotString(): calls EPDFAnnot_GetIntent twice (length probe + copy).
   * Returns \`undefined\` if no intent present.
   */
  getAnnotIntent(annotationPtr) {
    const len = this.pdfiumModule.EPDFAnnot_GetIntent(annotationPtr, 0, 0);
    if (len === 0) return;
    const codeUnits = len + 1;
    const bytes = codeUnits * 2;
    const ptr = this.memoryManager.malloc(bytes);
    this.pdfiumModule.EPDFAnnot_GetIntent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);
    return value && value !== "undefined" ? value : void 0;
  }
  /**
   * Write the \`/IT\` (Intent) name into an annotation dictionary.
   *
   * Mirrors EPDFAnnot_SetIntent in PDFium (expects a UTF‑8 FPDF_BYTESTRING).
   *
   * @param annotationPtr Pointer returned by FPDFPage_GetAnnot
   * @param intent        Name without leading slash, e.g. \`"PolygonCloud"\`
   *                      A leading “/” will be stripped for convenience.
   * @returns             true on success, false otherwise
   */
  setAnnotIntent(annotationPtr, intent) {
    return this.pdfiumModule.EPDFAnnot_SetIntent(annotationPtr, intent);
  }
  /**
   * Returns the rich‑content string stored in the annotation’s \`/RC\` entry.
   *
   * Works like \`getAnnotIntent()\`: first probe for length, then copy.
   * \`undefined\` when the annotation has no rich content.
   */
  getAnnotRichContent(annotationPtr) {
    const len = this.pdfiumModule.EPDFAnnot_GetRichContent(annotationPtr, 0, 0);
    if (len === 0) return;
    const codeUnits = len + 1;
    const bytes = codeUnits * 2;
    const ptr = this.memoryManager.malloc(bytes);
    this.pdfiumModule.EPDFAnnot_GetRichContent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);
    return value || void 0;
  }
  /**
   * Get annotation by name
   * @param pagePtr - pointer to pdf page object
   * @param name - name of annotation
   * @returns pointer to pdf annotation
   *
   * @private
   */
  getAnnotationByName(pagePtr, name) {
    return this.withWString(name, (wNamePtr) => {
      return this.pdfiumModule.EPDFPage_GetAnnotByName(pagePtr, wNamePtr);
    });
  }
  /**
   * Remove annotation by name
   * @param pagePtr - pointer to pdf page object
   * @param name - name of annotation
   * @returns true on success
   *
   * @private
   */
  removeAnnotationByName(pagePtr, name) {
    return this.withWString(name, (wNamePtr) => {
      return this.pdfiumModule.EPDFPage_RemoveAnnotByName(pagePtr, wNamePtr);
    });
  }
  /**
   * Set a string value (\`/T\`, \`/M\`, \`/State\`, …) to an annotation.
   *
   * @returns \`true\` if the operation was successful
   *
   * @private
   */
  setAnnotString(annotationPtr, key, value) {
    return this.withWString(value, (wValPtr) => {
      return this.pdfiumModule.FPDFAnnot_SetStringValue(annotationPtr, key, wValPtr);
    });
  }
  /**
   * Set a string value (\`/T\`, \`/M\`, \`/State\`, …) to an attachment.
   *
   * @returns \`true\` if the operation was successful
   *
   * @private
   */
  setAttachmentString(attachmentPtr, key, value) {
    return this.withWString(value, (wValPtr) => {
      return this.pdfiumModule.FPDFAttachment_SetStringValue(attachmentPtr, key, wValPtr);
    });
  }
  /**
   * Read vertices of pdf annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @returns vertices of pdf annotation
   *
   * @private
   */
  readPdfAnnoVertices(page, annotationPtr) {
    const vertices = [];
    const count = this.pdfiumModule.FPDFAnnot_GetVertices(annotationPtr, 0, 0);
    const pointMemorySize = 8;
    const pointsPtr = this.memoryManager.malloc(count * pointMemorySize);
    this.pdfiumModule.FPDFAnnot_GetVertices(annotationPtr, pointsPtr, count);
    for (let i = 0; i < count; i++) {
      const pointX = this.pdfiumModule.pdfium.getValue(pointsPtr + i * pointMemorySize, "float");
      const pointY = this.pdfiumModule.pdfium.getValue(
        pointsPtr + i * pointMemorySize + 4,
        "float"
      );
      const { x, y } = this.convertPagePointToDevicePoint(page, {
        x: pointX,
        y: pointY
      });
      const last = vertices[vertices.length - 1];
      if (!last || last.x !== x || last.y !== y) {
        vertices.push({ x, y });
      }
    }
    this.memoryManager.free(pointsPtr);
    return vertices;
  }
  /**
   * Sync the vertices of a polygon or polyline annotation.
   *
   * @param page  - pdf page infor
   * @param annotPtr - pointer to pdf annotation
   * @param vertices - the vertices to be set
   * @returns true on success
   *
   * @private
   */
  setPdfAnnoVertices(page, annotPtr, vertices) {
    const pdf = this.pdfiumModule.pdfium;
    const FS_POINTF_SIZE = 8;
    const buf = this.memoryManager.malloc(FS_POINTF_SIZE * vertices.length);
    vertices.forEach((v, i) => {
      const pagePt = this.convertDevicePointToPagePoint(page, v);
      pdf.setValue(buf + i * FS_POINTF_SIZE + 0, pagePt.x, "float");
      pdf.setValue(buf + i * FS_POINTF_SIZE + 4, pagePt.y, "float");
    });
    const ok = this.pdfiumModule.EPDFAnnot_SetVertices(annotPtr, buf, vertices.length);
    this.memoryManager.free(buf);
    return ok;
  }
  /**
   * Read the target of pdf bookmark
   * @param docPtr - pointer to pdf document object
   * @param getActionPtr - callback function to retrive the pointer of action
   * @param getDestinationPtr - callback function to retrive the pointer of destination
   * @returns target of pdf bookmark
   *
   * @private
   */
  readPdfBookmarkTarget(docPtr, getActionPtr, getDestinationPtr) {
    const actionPtr = getActionPtr();
    if (actionPtr) {
      const action = this.readPdfAction(docPtr, actionPtr);
      return {
        type: "action",
        action
      };
    } else {
      const destinationPtr = getDestinationPtr();
      if (destinationPtr) {
        const destination = this.readPdfDestination(docPtr, destinationPtr);
        return {
          type: "destination",
          destination
        };
      }
    }
  }
  /**
   * Read field of pdf widget annotation
   * @param formHandle - form handle
   * @param annotationPtr - pointer to pdf annotation
   * @returns field of pdf widget annotation
   *
   * @private
   */
  readPdfWidgetAnnoField(formHandle, annotationPtr) {
    const flag = this.pdfiumModule.FPDFAnnot_GetFormFieldFlags(
      formHandle,
      annotationPtr
    );
    const type = this.pdfiumModule.FPDFAnnot_GetFormFieldType(
      formHandle,
      annotationPtr
    );
    const name = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldName(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const alternateName = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldAlternateName(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const value = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldValue(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const options = [];
    if (type === PDF_FORM_FIELD_TYPE.COMBOBOX || type === PDF_FORM_FIELD_TYPE.LISTBOX) {
      const count = this.pdfiumModule.FPDFAnnot_GetOptionCount(formHandle, annotationPtr);
      for (let i = 0; i < count; i++) {
        const label = readString(
          this.pdfiumModule.pdfium,
          (buffer, bufferLength) => {
            return this.pdfiumModule.FPDFAnnot_GetOptionLabel(
              formHandle,
              annotationPtr,
              i,
              buffer,
              bufferLength
            );
          },
          this.pdfiumModule.pdfium.UTF16ToString
        );
        const isSelected = this.pdfiumModule.FPDFAnnot_IsOptionSelected(
          formHandle,
          annotationPtr,
          i
        );
        options.push({
          label,
          isSelected
        });
      }
    }
    let isChecked = false;
    if (type === PDF_FORM_FIELD_TYPE.CHECKBOX || type === PDF_FORM_FIELD_TYPE.RADIOBUTTON) {
      isChecked = this.pdfiumModule.FPDFAnnot_IsChecked(formHandle, annotationPtr);
    }
    return {
      flag,
      type,
      name,
      alternateName,
      value,
      isChecked,
      options
    };
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderAnnotation}
   *
   * @public
   */
  renderPageAnnotation(doc, page, annotation, options) {
    const {
      scaleFactor = 1,
      rotation = Rotation.Degree0,
      dpr = 1,
      mode = AppearanceMode.Normal,
      imageType = "image/webp",
      imageQuality
    } = options ?? {};
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      "renderPageAnnotation",
      doc,
      page,
      annotation,
      options
    );
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      \`RenderPageAnnotation\`,
      "Begin",
      \`\${doc.id}-\${page.index}-\${annotation.id}\`
    );
    const task = new Task();
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`RenderPageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}-\${annotation.id}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`RenderPageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}-\${annotation.id}\`
      );
      pageCtx.release();
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: "annotation not found" });
    }
    const finalScale = Math.max(0.01, scaleFactor * dpr);
    const rect = toIntRect(annotation.rect);
    const devRect = toIntRect(transformRect(page.size, rect, rotation, finalScale));
    const wDev = Math.max(1, devRect.size.width);
    const hDev = Math.max(1, devRect.size.height);
    const stride = wDev * 4;
    const bytes = stride * hDev;
    const heapPtr = this.memoryManager.malloc(bytes);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      wDev,
      hDev,
      4,
      heapPtr,
      stride
    );
    this.pdfiumModule.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 0);
    const M = buildUserToDeviceMatrix(
      rect,
      // {origin:{L,B}, size:{W,H}}
      rotation,
      wDev,
      hDev
    );
    const mPtr = this.memoryManager.malloc(6 * 4);
    const mView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, mPtr, 6);
    mView.set([M.a, M.b, M.c, M.d, M.e, M.f]);
    const FLAGS = 16;
    let ok = false;
    try {
      ok = !!this.pdfiumModule.EPDF_RenderAnnotBitmap(
        bitmapPtr,
        pageCtx.pagePtr,
        annotPtr,
        mode,
        mPtr,
        FLAGS
      );
    } finally {
      this.memoryManager.free(mPtr);
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      pageCtx.release();
    }
    if (!ok) {
      this.memoryManager.free(heapPtr);
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`RenderPageAnnotation\`,
        "End",
        \`\${doc.id}-\${page.index}-\${annotation.id}\`
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: "EPDF_RenderAnnotBitmap failed"
      });
    }
    const dispose = () => this.memoryManager.free(heapPtr);
    this.imageDataConverter(
      () => {
        const rgba = new Uint8ClampedArray(
          this.pdfiumModule.pdfium.HEAPU8.subarray(heapPtr, heapPtr + bytes)
        );
        return {
          width: wDev,
          height: hDev,
          data: rgba
        };
      },
      imageType,
      imageQuality
    ).then((out) => task.resolve(out)).catch((e) => {
      if (e instanceof OffscreenCanvasError) {
        try {
          const blob = this.encodeViaWasm(
            { ptr: heapPtr, width: wDev, height: hDev, stride },
            { type: imageType, quality: imageQuality }
          );
          task.resolve(blob);
        } catch (wasmError) {
          task.reject({ code: PdfErrorCode.Unknown, message: String(wasmError) });
        }
      } else {
        task.reject({ code: PdfErrorCode.Unknown, message: String(e) });
      }
    }).finally(dispose);
    return task;
  }
  encodeViaWasm(buf, opts) {
    const pdf = this.pdfiumModule.pdfium;
    const blobFrom = (outPtr, size, mime) => {
      const view = pdf.HEAPU8.subarray(outPtr, outPtr + size);
      const copy = new Uint8Array(view);
      this.memoryManager.free(outPtr);
      return new Blob([copy], { type: mime });
    };
    const pngLevel = 6;
    const outPtrPtr = this.memoryManager.malloc(4);
    try {
      switch (opts.type) {
        /*
        case 'image/webp': {
          const size = this.pdfiumModule.EPDF_WebP_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            webpQ,
            outPtrPtr,
          );
          const outPtr = pdf.getValue(outPtrPtr, 'i32');
          return blobFrom(outPtr, size, 'image/webp');
        }
        case 'image/jpeg': {
          const size = this.pdfiumModule.EPDF_JPEG_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            jpegQ,
            outPtrPtr,
          );
          const outPtr = pdf.getValue(outPtrPtr, 'i32');
          return blobFrom(outPtr, size, 'image/jpeg');
        }
        */
        case "image/png":
        default: {
          const size = this.pdfiumModule.EPDF_PNG_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            pngLevel,
            outPtrPtr
          );
          const outPtr = pdf.getValue(outPtrPtr, "i32");
          return blobFrom(WasmPointer(outPtr), size, "image/png");
        }
      }
    } finally {
      this.memoryManager.free(outPtrPtr);
    }
  }
  renderRectEncoded(doc, page, rect, options) {
    const task = new Task();
    const imageType = (options == null ? void 0 : options.imageType) ?? "image/webp";
    const quality = options == null ? void 0 : options.imageQuality;
    const rotation = (options == null ? void 0 : options.rotation) ?? Rotation.Degree0;
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "document does not open"
      });
    }
    const scale = Math.max(0.01, (options == null ? void 0 : options.scaleFactor) ?? 1);
    const dpr = Math.max(1, (options == null ? void 0 : options.dpr) ?? 1);
    const finalScale = scale * dpr;
    const baseW = rect.size.width;
    const baseH = rect.size.height;
    const swap2 = (rotation & 1) === 1;
    const wDev = Math.max(1, Math.round((swap2 ? baseH : baseW) * finalScale));
    const hDev = Math.max(1, Math.round((swap2 ? baseW : baseH) * finalScale));
    const stride = wDev * 4;
    const bytes = stride * hDev;
    const pageCtx = ctx.acquirePage(page.index);
    const heapPtr = this.memoryManager.malloc(bytes);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      wDev,
      hDev,
      4,
      heapPtr,
      stride
    );
    this.pdfiumModule.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 4294967295);
    const M = buildUserToDeviceMatrix(rect, rotation, wDev, hDev);
    const mPtr = this.memoryManager.malloc(6 * 4);
    const mView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, mPtr, 6);
    mView.set([M.a, M.b, M.c, M.d, M.e, M.f]);
    const clipPtr = this.memoryManager.malloc(4 * 4);
    const clipView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, clipPtr, 4);
    clipView.set([0, 0, wDev, hDev]);
    let flags = 16;
    if ((options == null ? void 0 : options.withAnnotations) ?? false) flags |= 1;
    try {
      this.pdfiumModule.FPDF_RenderPageBitmapWithMatrix(
        bitmapPtr,
        pageCtx.pagePtr,
        mPtr,
        clipPtr,
        flags
      );
    } finally {
      pageCtx.release();
      this.memoryManager.free(mPtr);
      this.memoryManager.free(clipPtr);
    }
    const dispose = () => {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.memoryManager.free(heapPtr);
    };
    this.imageDataConverter(
      () => {
        const heapBuf = this.pdfiumModule.pdfium.HEAPU8.buffer;
        const data = new Uint8ClampedArray(heapBuf, heapPtr, bytes);
        return {
          width: wDev,
          height: hDev,
          data
        };
      },
      imageType,
      quality
    ).then((out) => task.resolve(out)).catch((e) => {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, "Error", e);
      if (e instanceof OffscreenCanvasError) {
        this.logger.info(LOG_SOURCE, LOG_CATEGORY, "Fallback to WASM encoding");
        try {
          const blob = this.encodeViaWasm(
            { ptr: heapPtr, width: wDev, height: hDev, stride },
            { type: imageType, quality }
          );
          task.resolve(blob);
        } catch (wasmError) {
          task.reject({ code: PdfErrorCode.Unknown, message: String(wasmError) });
        }
      } else {
        task.reject({ code: PdfErrorCode.Unknown, message: String(e) });
      }
    }).finally(dispose);
    return task;
  }
  /**
   * Read the target of pdf link annotation
   * @param docPtr - pointer to pdf document object
   * @param getActionPtr - callback function to retrive the pointer of action
   * @param getDestinationPtr - callback function to retrive the pointer of destination
   * @returns target of link
   *
   * @private
   */
  readPdfLinkAnnoTarget(docPtr, getActionPtr, getDestinationPtr) {
    const destinationPtr = getDestinationPtr();
    if (destinationPtr) {
      const destination = this.readPdfDestination(docPtr, destinationPtr);
      return {
        type: "destination",
        destination
      };
    } else {
      const actionPtr = getActionPtr();
      if (actionPtr) {
        const action = this.readPdfAction(docPtr, actionPtr);
        return {
          type: "action",
          action
        };
      }
    }
  }
  createLocalDestPtr(docPtr, dest) {
    var _a, _b;
    const pagePtr = this.pdfiumModule.FPDF_LoadPage(docPtr, dest.pageIndex);
    if (!pagePtr) return 0;
    try {
      if (dest.zoom.mode === PdfZoomMode.XYZ) {
        const { x, y, zoom } = dest.zoom.params;
        return this.pdfiumModule.EPDFDest_CreateXYZ(
          pagePtr,
          /*has_left*/
          true,
          x,
          /*has_top*/
          true,
          y,
          /*has_zoom*/
          true,
          zoom
        );
      }
      let viewEnum;
      let params = [];
      switch (dest.zoom.mode) {
        case PdfZoomMode.FitPage:
          viewEnum = PdfZoomMode.FitPage;
          break;
        case PdfZoomMode.FitHorizontal:
          viewEnum = PdfZoomMode.FitHorizontal;
          params = [((_a = dest.view) == null ? void 0 : _a[0]) ?? 0];
          break;
        case PdfZoomMode.FitVertical:
          viewEnum = PdfZoomMode.FitVertical;
          params = [((_b = dest.view) == null ? void 0 : _b[0]) ?? 0];
          break;
        case PdfZoomMode.FitRectangle:
          {
            const v = dest.view ?? [];
            params = [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
            viewEnum = PdfZoomMode.FitRectangle;
          }
          break;
        case PdfZoomMode.Unknown:
        default:
          return 0;
      }
      return this.withFloatArray(
        params,
        (ptr, count) => this.pdfiumModule.EPDFDest_CreateView(pagePtr, viewEnum, ptr, count)
      );
    } finally {
      this.pdfiumModule.FPDF_ClosePage(pagePtr);
    }
  }
  applyBookmarkTarget(docPtr, bmPtr, target) {
    if (target.type === "destination") {
      const destPtr = this.createLocalDestPtr(docPtr, target.destination);
      if (!destPtr) return false;
      const ok = this.pdfiumModule.EPDFBookmark_SetDest(docPtr, bmPtr, destPtr);
      return !!ok;
    }
    const action = target.action;
    switch (action.type) {
      case PdfActionType.Goto: {
        const destPtr = this.createLocalDestPtr(docPtr, action.destination);
        if (!destPtr) return false;
        const actPtr = this.pdfiumModule.EPDFAction_CreateGoTo(docPtr, destPtr);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }
      case PdfActionType.URI: {
        const actPtr = this.pdfiumModule.EPDFAction_CreateURI(docPtr, action.uri);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }
      case PdfActionType.LaunchAppOrOpenFile: {
        const actPtr = this.withWString(
          action.path,
          (wptr) => this.pdfiumModule.EPDFAction_CreateLaunch(docPtr, wptr)
        );
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }
      case PdfActionType.RemoteGoto:
        return false;
      case PdfActionType.Unsupported:
      default:
        return false;
    }
  }
  /**
   * Read pdf action from pdf document
   * @param docPtr - pointer to pdf document object
   * @param actionPtr - pointer to pdf action object
   * @returns pdf action object
   *
   * @private
   */
  readPdfAction(docPtr, actionPtr) {
    const actionType = this.pdfiumModule.FPDFAction_GetType(actionPtr);
    let action;
    switch (actionType) {
      case PdfActionType.Unsupported:
        action = {
          type: PdfActionType.Unsupported
        };
        break;
      case PdfActionType.Goto:
        {
          const destinationPtr = this.pdfiumModule.FPDFAction_GetDest(docPtr, actionPtr);
          if (destinationPtr) {
            const destination = this.readPdfDestination(docPtr, destinationPtr);
            action = {
              type: PdfActionType.Goto,
              destination
            };
          } else {
            action = {
              type: PdfActionType.Unsupported
            };
          }
        }
        break;
      case PdfActionType.RemoteGoto:
        {
          action = {
            type: PdfActionType.Unsupported
          };
        }
        break;
      case PdfActionType.URI:
        {
          const uri = readString(
            this.pdfiumModule.pdfium,
            (buffer, bufferLength) => {
              return this.pdfiumModule.FPDFAction_GetURIPath(
                docPtr,
                actionPtr,
                buffer,
                bufferLength
              );
            },
            this.pdfiumModule.pdfium.UTF8ToString
          );
          action = {
            type: PdfActionType.URI,
            uri
          };
        }
        break;
      case PdfActionType.LaunchAppOrOpenFile:
        {
          const path = readString(
            this.pdfiumModule.pdfium,
            (buffer, bufferLength) => {
              return this.pdfiumModule.FPDFAction_GetFilePath(actionPtr, buffer, bufferLength);
            },
            this.pdfiumModule.pdfium.UTF8ToString
          );
          action = {
            type: PdfActionType.LaunchAppOrOpenFile,
            path
          };
        }
        break;
    }
    return action;
  }
  /**
   * Read pdf destination object
   * @param docPtr - pointer to pdf document object
   * @param destinationPtr - pointer to pdf destination
   * @returns pdf destination object
   *
   * @private
   */
  readPdfDestination(docPtr, destinationPtr) {
    const pageIndex = this.pdfiumModule.FPDFDest_GetDestPageIndex(docPtr, destinationPtr);
    const maxParmamsCount = 4;
    const paramsCountPtr = this.memoryManager.malloc(maxParmamsCount);
    const paramsPtr = this.memoryManager.malloc(maxParmamsCount * 4);
    const zoomMode = this.pdfiumModule.FPDFDest_GetView(
      destinationPtr,
      paramsCountPtr,
      paramsPtr
    );
    const paramsCount = this.pdfiumModule.pdfium.getValue(paramsCountPtr, "i32");
    const view = [];
    for (let i = 0; i < paramsCount; i++) {
      const paramPtr = paramsPtr + i * 4;
      view.push(this.pdfiumModule.pdfium.getValue(paramPtr, "float"));
    }
    this.memoryManager.free(paramsCountPtr);
    this.memoryManager.free(paramsPtr);
    if (zoomMode === PdfZoomMode.XYZ) {
      const hasXPtr = this.memoryManager.malloc(1);
      const hasYPtr = this.memoryManager.malloc(1);
      const hasZPtr = this.memoryManager.malloc(1);
      const xPtr = this.memoryManager.malloc(4);
      const yPtr = this.memoryManager.malloc(4);
      const zPtr = this.memoryManager.malloc(4);
      const isSucceed = this.pdfiumModule.FPDFDest_GetLocationInPage(
        destinationPtr,
        hasXPtr,
        hasYPtr,
        hasZPtr,
        xPtr,
        yPtr,
        zPtr
      );
      if (isSucceed) {
        const hasX = this.pdfiumModule.pdfium.getValue(hasXPtr, "i8");
        const hasY = this.pdfiumModule.pdfium.getValue(hasYPtr, "i8");
        const hasZ = this.pdfiumModule.pdfium.getValue(hasZPtr, "i8");
        const x = hasX ? this.pdfiumModule.pdfium.getValue(xPtr, "float") : 0;
        const y = hasY ? this.pdfiumModule.pdfium.getValue(yPtr, "float") : 0;
        const zoom = hasZ ? this.pdfiumModule.pdfium.getValue(zPtr, "float") : 0;
        this.memoryManager.free(hasXPtr);
        this.memoryManager.free(hasYPtr);
        this.memoryManager.free(hasZPtr);
        this.memoryManager.free(xPtr);
        this.memoryManager.free(yPtr);
        this.memoryManager.free(zPtr);
        return {
          pageIndex,
          zoom: {
            mode: zoomMode,
            params: {
              x,
              y,
              zoom
            }
          },
          view
        };
      }
      this.memoryManager.free(hasXPtr);
      this.memoryManager.free(hasYPtr);
      this.memoryManager.free(hasZPtr);
      this.memoryManager.free(xPtr);
      this.memoryManager.free(yPtr);
      this.memoryManager.free(zPtr);
      return {
        pageIndex,
        zoom: {
          mode: zoomMode,
          params: {
            x: 0,
            y: 0,
            zoom: 0
          }
        },
        view
      };
    }
    return {
      pageIndex,
      zoom: {
        mode: zoomMode
      },
      view
    };
  }
  /**
   * Read attachmet from pdf document
   * @param docPtr - pointer to pdf document object
   * @param index - index of attachment
   * @returns attachment content
   *
   * @private
   */
  readPdfAttachment(docPtr, index) {
    const attachmentPtr = this.pdfiumModule.FPDFDoc_GetAttachment(docPtr, index);
    const name = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetName(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const description = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.EPDFAttachment_GetDescription(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const mimeType = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetSubtype(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const creationDate = this.getAttachmentDate(attachmentPtr, "CreationDate");
    const checksum = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetStringValue(
          attachmentPtr,
          "Checksum",
          buffer,
          bufferLength
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString
    );
    const size = this.getAttachmentNumber(attachmentPtr, "Size");
    return {
      index,
      name,
      description,
      mimeType,
      size,
      creationDate,
      checksum
    };
  }
  /**
   * Convert coordinate of point from device coordinate to page coordinate
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  convertDevicePointToPagePoint(page, position) {
    const DW = page.size.width;
    const DH = page.size.height;
    const r = page.rotation & 3;
    if (r === 0) {
      return { x: position.x, y: DH - position.y };
    }
    if (r === 1) {
      return { x: position.y, y: position.x };
    }
    if (r === 2) {
      return { x: DW - position.x, y: position.y };
    }
    {
      return { x: DH - position.y, y: DW - position.x };
    }
  }
  /**
   * Convert coordinate of point from page coordinate to device coordinate
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  convertPagePointToDevicePoint(page, position) {
    const DW = page.size.width;
    const DH = page.size.height;
    const r = page.rotation & 3;
    if (r === 0) {
      return { x: position.x, y: DH - position.y };
    }
    if (r === 1) {
      return { x: position.y, y: position.x };
    }
    if (r === 2) {
      return { x: DW - position.x, y: position.y };
    }
    {
      return { x: DW - position.y, y: DH - position.x };
    }
  }
  /**
   * Convert coordinate of rectangle from page coordinate to device coordinate
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param pageRect - rectangle that needs to be converted
   * @returns converted rectangle
   *
   * @private
   */
  convertPageRectToDeviceRect(page, pageRect) {
    const { x, y } = this.convertPagePointToDevicePoint(page, {
      x: pageRect.left,
      y: pageRect.top
    });
    const rect = {
      origin: {
        x,
        y
      },
      size: {
        width: Math.abs(pageRect.right - pageRect.left),
        height: Math.abs(pageRect.top - pageRect.bottom)
      }
    };
    return rect;
  }
  /**
   * Read the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @returns appearance stream
   *
   * @private
   */
  readPageAnnoAppearanceStreams(annotationPtr) {
    return {
      normal: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Normal),
      rollover: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Rollover),
      down: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Down)
    };
  }
  /**
   * Read the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @returns appearance stream
   *
   * @private
   */
  readPageAnnoAppearanceStream(annotationPtr, mode = AppearanceMode.Normal) {
    const utf16Length = this.pdfiumModule.FPDFAnnot_GetAP(annotationPtr, mode, 0, 0);
    const bytesCount = (utf16Length + 1) * 2;
    const bufferPtr = this.memoryManager.malloc(bytesCount);
    this.pdfiumModule.FPDFAnnot_GetAP(annotationPtr, mode, bufferPtr, bytesCount);
    const ap = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
    this.memoryManager.free(bufferPtr);
    return ap;
  }
  /**
   * Set the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @param apContent - appearance stream content (null to remove)
   * @returns whether the appearance stream was set successfully
   *
   * @private
   */
  setPageAnnoAppearanceStream(annotationPtr, mode = AppearanceMode.Normal, apContent) {
    const bytes = 2 * (apContent.length + 1);
    const ptr = this.memoryManager.malloc(bytes);
    try {
      this.pdfiumModule.pdfium.stringToUTF16(apContent, ptr, bytes);
      const ok = this.pdfiumModule.FPDFAnnot_SetAP(annotationPtr, mode, ptr);
      return !!ok;
    } finally {
      this.memoryManager.free(ptr);
    }
  }
  /**
   * Set the rect of specified annotation
   * @param page - page info that the annotation is belonged to
   * @param annotationPtr - pointer to annotation object
   * @param rect - target rectangle
   * @returns whether the rect is setted
   *
   * @private
   */
  setPageAnnoRect(page, annotPtr, rect) {
    const x0d = Math.floor(rect.origin.x);
    const y0d = Math.floor(rect.origin.y);
    const x1d = Math.floor(rect.origin.x + rect.size.width);
    const y1d = Math.floor(rect.origin.y + rect.size.height);
    const TL = this.convertDevicePointToPagePoint(page, { x: x0d, y: y0d });
    const TR = this.convertDevicePointToPagePoint(page, { x: x1d, y: y0d });
    const BR = this.convertDevicePointToPagePoint(page, { x: x1d, y: y1d });
    const BL = this.convertDevicePointToPagePoint(page, { x: x0d, y: y1d });
    let left = Math.min(TL.x, TR.x, BR.x, BL.x);
    let right = Math.max(TL.x, TR.x, BR.x, BL.x);
    let bottom = Math.min(TL.y, TR.y, BR.y, BL.y);
    let top = Math.max(TL.y, TR.y, BR.y, BL.y);
    if (left > right) [left, right] = [right, left];
    if (bottom > top) [bottom, top] = [top, bottom];
    const ptr = this.memoryManager.malloc(16);
    const pdf = this.pdfiumModule.pdfium;
    pdf.setValue(ptr + 0, left, "float");
    pdf.setValue(ptr + 4, top, "float");
    pdf.setValue(ptr + 8, right, "float");
    pdf.setValue(ptr + 12, bottom, "float");
    const ok = this.pdfiumModule.FPDFAnnot_SetRect(annotPtr, ptr);
    this.memoryManager.free(ptr);
    return !!ok;
  }
  /**
   * Read the rectangle of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns rectangle of annotation
   *
   * @private
   */
  readPageAnnoRect(annotationPtr) {
    const pageRectPtr = this.memoryManager.malloc(4 * 4);
    const pageRect = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    };
    if (this.pdfiumModule.FPDFAnnot_GetRect(annotationPtr, pageRectPtr)) {
      pageRect.left = this.pdfiumModule.pdfium.getValue(pageRectPtr, "float");
      pageRect.top = this.pdfiumModule.pdfium.getValue(pageRectPtr + 4, "float");
      pageRect.right = this.pdfiumModule.pdfium.getValue(pageRectPtr + 8, "float");
      pageRect.bottom = this.pdfiumModule.pdfium.getValue(pageRectPtr + 12, "float");
    }
    this.memoryManager.free(pageRectPtr);
    return pageRect;
  }
  /**
   * Get highlight rects for a specific character range (for search highlighting)
   * @param page - pdf page info
   * @param pagePtr - pointer to pdf page
   * @param textPagePtr - pointer to pdf text page
   * @param startIndex - starting character index
   * @param charCount - number of characters in the range
   * @returns array of rectangles for highlighting the specified character range
   *
   * @private
   */
  getHighlightRects(page, textPagePtr, startIndex, charCount) {
    const rectsCount = this.pdfiumModule.FPDFText_CountRects(textPagePtr, startIndex, charCount);
    const highlightRects = [];
    const l = this.memoryManager.malloc(8);
    const t = this.memoryManager.malloc(8);
    const r = this.memoryManager.malloc(8);
    const b = this.memoryManager.malloc(8);
    for (let i = 0; i < rectsCount; i++) {
      const ok = this.pdfiumModule.FPDFText_GetRect(textPagePtr, i, l, t, r, b);
      if (!ok) continue;
      const left = this.pdfiumModule.pdfium.getValue(l, "double");
      const top = this.pdfiumModule.pdfium.getValue(t, "double");
      const right = this.pdfiumModule.pdfium.getValue(r, "double");
      const bottom = this.pdfiumModule.pdfium.getValue(b, "double");
      const p1 = this.convertPagePointToDevicePoint(page, { x: left, y: top });
      const p2 = this.convertPagePointToDevicePoint(page, { x: right, y: top });
      const p3 = this.convertPagePointToDevicePoint(page, { x: right, y: bottom });
      const p4 = this.convertPagePointToDevicePoint(page, { x: left, y: bottom });
      const xs = [p1.x, p2.x, p3.x, p4.x];
      const ys = [p1.y, p2.y, p3.y, p4.y];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;
      highlightRects.push({
        origin: { x, y },
        size: { width: Math.ceil(width), height: Math.ceil(height) }
      });
    }
    this.memoryManager.free(l);
    this.memoryManager.free(t);
    this.memoryManager.free(r);
    this.memoryManager.free(b);
    return highlightRects;
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.searchAllPages}
   *
   * Runs inside the worker.
   * Emits per-page progress: { page, results }
   *
   * @public
   */
  searchAllPages(doc, keyword, options) {
    var _a;
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "searchAllPages", doc, keyword, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SearchAllPages", "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SearchAllPages", "End", doc.id);
      return PdfTaskHelper.resolve({
        results: [],
        total: 0
      });
    }
    const length = 2 * (keyword.length + 1);
    const keywordPtr = this.memoryManager.malloc(length);
    this.pdfiumModule.pdfium.stringToUTF16(keyword, keywordPtr, length);
    const flag = ((_a = options == null ? void 0 : options.flags) == null ? void 0 : _a.reduce((acc, f) => acc | f, MatchFlag.None)) ?? MatchFlag.None;
    const task = PdfTaskHelper.create();
    let cancelled = false;
    task.wait(
      () => {
      },
      (err) => {
        if (err.type === "abort") cancelled = true;
      }
    );
    const CHUNK_SIZE = 100;
    const allResults = [];
    const processChunk = (startIdx) => {
      if (cancelled) return;
      const endIdx = Math.min(startIdx + CHUNK_SIZE, doc.pageCount);
      try {
        for (let pageIndex = startIdx; pageIndex < endIdx && !cancelled; pageIndex++) {
          const pageResults = this.searchAllInPage(ctx, doc.pages[pageIndex], keywordPtr, flag);
          allResults.push(...pageResults);
          task.progress({ page: pageIndex, results: pageResults });
        }
      } catch (e) {
        if (!cancelled) {
          this.memoryManager.free(keywordPtr);
          this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SearchAllPages", "End", doc.id);
          task.reject({
            code: PdfErrorCode.Unknown,
            message: \`Error searching document: \${e}\`
          });
        }
        return;
      }
      if (cancelled) return;
      if (endIdx >= doc.pageCount) {
        this.memoryManager.free(keywordPtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, "SearchAllPages", "End", doc.id);
        task.resolve({ results: allResults, total: allResults.length });
        return;
      }
      setTimeout(() => processChunk(endIdx), 0);
    };
    setTimeout(() => processChunk(0), 0);
    task.wait(
      () => {
      },
      (err) => {
        if (err.type === "abort") {
          try {
            this.memoryManager.free(keywordPtr);
          } catch {
          }
        }
      }
    );
    return task;
  }
  /**
   * Extract word-aligned context for a search hit.
   *
   * @param fullText      full UTF-16 page text (fetch this once per page!)
   * @param start         index of 1st char that matched
   * @param count         number of chars in the match
   * @param windowChars   minimum context chars to keep left & right
   */
  buildContext(fullText, start, count, windowChars = 30) {
    const WORD_BREAK = /[\\s\\u00A0.,;:!?()\\[\\]{}<>/\\\\\\-"'\`"”\\u2013\\u2014]/;
    const findWordStart = (index) => {
      while (index > 0 && !WORD_BREAK.test(fullText[index - 1])) index--;
      return index;
    };
    const findWordEnd = (index) => {
      while (index < fullText.length && !WORD_BREAK.test(fullText[index])) index++;
      return index;
    };
    let left = start;
    while (left > 0 && WORD_BREAK.test(fullText[left - 1])) left--;
    let collected = 0;
    while (left > 0 && collected < windowChars) {
      left--;
      if (!WORD_BREAK.test(fullText[left])) collected++;
    }
    left = findWordStart(left);
    let right = start + count;
    while (right < fullText.length && WORD_BREAK.test(fullText[right])) right++;
    collected = 0;
    while (right < fullText.length && collected < windowChars) {
      if (!WORD_BREAK.test(fullText[right])) collected++;
      right++;
    }
    right = findWordEnd(right);
    const before = fullText.slice(left, start).replace(/\\s+/g, " ").trimStart();
    const match = fullText.slice(start, start + count);
    const after = fullText.slice(start + count, right).replace(/\\s+/g, " ").trimEnd();
    return {
      before: this.tidy(before),
      match: this.tidy(match),
      after: this.tidy(after),
      truncatedLeft: left > 0,
      truncatedRight: right < fullText.length
    };
  }
  /**
   * Tidy the text to remove any non-printable characters and whitespace
   * @param s - text to tidy
   * @returns tidied text
   *
   * @private
   */
  tidy(s) {
    return s.replace(/-\\uFFFE\\s*/g, "").replace(/[\\uFFFE\\u00AD\\u200B\\u2060\\uFEFF]/g, "").replace(/\\s+/g, " ");
  }
  /**
   * Search for all occurrences of a keyword on a single page
   * This method efficiently loads the page only once and finds all matches
   *
   * @param docPtr - pointer to pdf document
   * @param page - pdf page object
   * @param pageIndex - index of the page
   * @param keywordPtr - pointer to the search keyword
   * @param flag - search flags
   * @returns array of search results on this page
   *
   * @private
   */
  searchAllInPage(ctx, page, keywordPtr, flag) {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const textPagePtr = pageCtx.getTextPage();
      const total = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
      const bufPtr = this.memoryManager.malloc(2 * (total + 1));
      this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, total, bufPtr);
      const fullText = this.pdfiumModule.pdfium.UTF16ToString(bufPtr);
      this.memoryManager.free(bufPtr);
      const pageResults = [];
      const searchHandle = this.pdfiumModule.FPDFText_FindStart(
        textPagePtr,
        keywordPtr,
        flag,
        0
        // Start from the beginning of the page
      );
      while (this.pdfiumModule.FPDFText_FindNext(searchHandle)) {
        const charIndex = this.pdfiumModule.FPDFText_GetSchResultIndex(searchHandle);
        const charCount = this.pdfiumModule.FPDFText_GetSchCount(searchHandle);
        const rects = this.getHighlightRects(page, textPagePtr, charIndex, charCount);
        const context = this.buildContext(fullText, charIndex, charCount);
        pageResults.push({
          pageIndex: page.index,
          charIndex,
          charCount,
          rects,
          context
        });
      }
      this.pdfiumModule.FPDFText_FindClose(searchHandle);
      return pageResults;
    });
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.preparePrintDocument}
   *
   * Prepares a PDF document for printing with specified options.
   * Creates a new document with selected pages and optionally removes annotations
   * for optimal printing performance.
   *
   * @public
   */
  preparePrintDocument(doc, options) {
    const { includeAnnotations = true, pageRange = null } = options ?? {};
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, "preparePrintDocument", doc, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "Begin", doc.id);
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: "Document is not open"
      });
    }
    const printDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!printDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: "Cannot create print document"
      });
    }
    try {
      const sanitizedPageRange = this.sanitizePageRange(pageRange, doc.pageCount);
      if (!this.pdfiumModule.FPDF_ImportPages(
        printDocPtr,
        ctx.docPtr,
        sanitizedPageRange ?? "",
        0
        // Insert at beginning
      )) {
        this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, "Failed to import pages for printing");
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
        return PdfTaskHelper.reject({
          code: PdfErrorCode.CantImportPages,
          message: "Failed to import pages for printing"
        });
      }
      if (!includeAnnotations) {
        const removalResult = this.removeAnnotationsFromPrintDocument(printDocPtr);
        if (!removalResult.success) {
          this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
          this.logger.error(
            LOG_SOURCE,
            LOG_CATEGORY,
            \`Failed to remove annotations: \${removalResult.error}\`
          );
          this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
          return PdfTaskHelper.reject({
            code: PdfErrorCode.Unknown,
            message: \`Failed to prepare print document: \${removalResult.error}\`
          });
        }
        this.logger.debug(
          LOG_SOURCE,
          LOG_CATEGORY,
          \`Removed \${removalResult.annotationsRemoved} annotations from \${removalResult.pagesProcessed} pages\`
        );
      }
      const buffer = this.saveDocument(printDocPtr);
      this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
      return PdfTaskHelper.resolve(buffer);
    } catch (error) {
      if (printDocPtr) {
        this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
      }
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, "preparePrintDocument failed", error);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, \`PreparePrintDocument\`, "End", doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: error instanceof Error ? error.message : "Failed to prepare print document"
      });
    }
  }
  /**
   * Removes all annotations from a print document using fast raw annotation functions.
   * This method is optimized for performance by avoiding full page loading.
   *
   * @param printDocPtr - Pointer to the print document
   * @returns Result object with success status and statistics
   *
   * @private
   */
  removeAnnotationsFromPrintDocument(printDocPtr) {
    let totalAnnotationsRemoved = 0;
    let pagesProcessed = 0;
    try {
      const pageCount = this.pdfiumModule.FPDF_GetPageCount(printDocPtr);
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const annotCount = this.pdfiumModule.EPDFPage_GetAnnotCountRaw(printDocPtr, pageIndex);
        if (annotCount <= 0) {
          pagesProcessed++;
          continue;
        }
        let annotationsRemovedFromPage = 0;
        for (let annotIndex = annotCount - 1; annotIndex >= 0; annotIndex--) {
          const removed = this.pdfiumModule.EPDFPage_RemoveAnnotRaw(
            printDocPtr,
            pageIndex,
            annotIndex
          );
          if (removed) {
            annotationsRemovedFromPage++;
            totalAnnotationsRemoved++;
          } else {
            this.logger.warn(
              LOG_SOURCE,
              LOG_CATEGORY,
              \`Failed to remove annotation \${annotIndex} from page \${pageIndex}\`
            );
          }
        }
        if (annotationsRemovedFromPage > 0) {
          const pagePtr = this.pdfiumModule.FPDF_LoadPage(printDocPtr, pageIndex);
          if (pagePtr) {
            this.pdfiumModule.FPDFPage_GenerateContent(pagePtr);
            this.pdfiumModule.FPDF_ClosePage(pagePtr);
          }
        }
        pagesProcessed++;
      }
      return {
        success: true,
        annotationsRemoved: totalAnnotationsRemoved,
        pagesProcessed
      };
    } catch (error) {
      return {
        success: false,
        annotationsRemoved: totalAnnotationsRemoved,
        pagesProcessed,
        error: error instanceof Error ? error.message : "Unknown error during annotation removal"
      };
    }
  }
  /**
   * Sanitizes and validates a page range string.
   * Ensures page numbers are within valid bounds and properly formatted.
   *
   * @param pageRange - Page range string (e.g., "1,3,5-7") or null for all pages
   * @param totalPages - Total number of pages in the document
   * @returns Sanitized page range string or null for all pages
   *
   * @private
   */
  sanitizePageRange(pageRange, totalPages) {
    if (!pageRange || pageRange.trim() === "") {
      return null;
    }
    try {
      const sanitized = [];
      const parts = pageRange.split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.includes("-")) {
          const [startStr, endStr] = trimmed.split("-").map((s) => s.trim());
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);
          if (isNaN(start) || isNaN(end)) {
            this.logger.warn(LOG_SOURCE, LOG_CATEGORY, \`Invalid range: \${trimmed}\`);
            continue;
          }
          const validStart = Math.max(1, Math.min(start, totalPages));
          const validEnd = Math.max(1, Math.min(end, totalPages));
          for (let i = validStart; i <= validEnd; i++) {
            if (!sanitized.includes(i)) {
              sanitized.push(i);
            }
          }
        } else {
          const pageNum = parseInt(trimmed, 10);
          if (isNaN(pageNum)) {
            this.logger.warn(LOG_SOURCE, LOG_CATEGORY, \`Invalid page number: \${trimmed}\`);
            continue;
          }
          const validPageNum = Math.max(1, Math.min(pageNum, totalPages));
          if (!sanitized.includes(validPageNum)) {
            sanitized.push(validPageNum);
          }
        }
      }
      if (sanitized.length === 0) {
        this.logger.warn(LOG_SOURCE, LOG_CATEGORY, "No valid pages in range, using all pages");
        return null;
      }
      sanitized.sort((a, b) => a - b);
      const optimized = [];
      let rangeStart = sanitized[0];
      let rangeEnd = sanitized[0];
      for (let i = 1; i < sanitized.length; i++) {
        if (sanitized[i] === rangeEnd + 1) {
          rangeEnd = sanitized[i];
        } else {
          if (rangeStart === rangeEnd) {
            optimized.push(rangeStart.toString());
          } else if (rangeEnd - rangeStart === 1) {
            optimized.push(rangeStart.toString());
            optimized.push(rangeEnd.toString());
          } else {
            optimized.push(\`\${rangeStart}-\${rangeEnd}\`);
          }
          rangeStart = sanitized[i];
          rangeEnd = sanitized[i];
        }
      }
      if (rangeStart === rangeEnd) {
        optimized.push(rangeStart.toString());
      } else if (rangeEnd - rangeStart === 1) {
        optimized.push(rangeStart.toString());
        optimized.push(rangeEnd.toString());
      } else {
        optimized.push(\`\${rangeStart}-\${rangeEnd}\`);
      }
      const result = optimized.join(",");
      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        \`Sanitized page range: "\${pageRange}" -> "\${result}"\`
      );
      return result;
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, \`Error sanitizing page range: \${error}\`);
      return null;
    }
  }
}
class PdfiumEngineRunner extends EngineRunner {
  /**
   * Create an instance of PdfiumEngineRunner
   * @param wasmBinary - wasm binary that contains the pdfium wasm file
   */
  constructor(wasmBinary, logger) {
    super(logger);
    this.wasmBinary = wasmBinary;
  }
  /**
   * Initialize runner
   */
  async prepare() {
    const wasmBinary = this.wasmBinary;
    const wasmModule = await init({ wasmBinary });
    this.engine = new PdfiumEngine(wasmModule, { logger: this.logger });
    this.ready();
  }
}
let runner = null;
self.onmessage = async (event) => {
  const { type, wasmUrl, logger: serializedLogger } = event.data;
  if (type === "wasmInit" && wasmUrl && !runner) {
    try {
      const response = await fetch(wasmUrl);
      const wasmBinary = await response.arrayBuffer();
      const logger = serializedLogger ? deserializeLogger(serializedLogger) : void 0;
      runner = new PdfiumEngineRunner(wasmBinary, logger);
      await runner.prepare();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: "wasmError", error: message });
    }
  }
};
`],{type:"application/javascript"})),{type:"module"});return e.postMessage({type:"wasmInit",wasmUrl:t,logger:n?r(n):void 0}),new o(e,n)}export{i as createPdfiumEngine};
