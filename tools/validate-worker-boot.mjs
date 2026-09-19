// 검증 워커 부트스트랩 — worker_threads 는 부모의 tsx 로더를 물려받지 않는다.
import { register } from 'tsx/esm/api';
register();
await import('./validate-worker.ts');
