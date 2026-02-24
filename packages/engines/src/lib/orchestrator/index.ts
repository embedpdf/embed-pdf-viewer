/**
 * Orchestrator layer for PDF engines
 *
 * This module provides the "smart" orchestration layer that wraps
 * the "dumb" executor (PdfiumNative or RemoteExecutor) with:
 * - Priority-based task scheduling
 * - Visibility-aware task ranking
 * - Parallel image encoding
 * - Multi-page operation orchestration
 *
 * @packageDocumentation
 */

export * from './task-queue';
export * from './pdf-engine';
export * from './remote-executor';
export * from './pdfium-native-runner';
