/**
 * 通信层的统一出口。
 *
 * 上层只从 `api/` 引入，不直接碰具体实现——将来加 WebSocket（线 B）
 * 或替换传输方式时，调用方不用改 import 路径。
 */
export * from './rest';
export * from './types';
export * from './live';
