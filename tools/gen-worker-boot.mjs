// 워커 부트스트랩. docs/PLAN.md §8.4 병렬화
//
// worker_threads 는 부모의 tsx 로더를 물려받지 않는다. 여기서 한 번 걸고
// TypeScript 워커를 불러온다. 이 파일만 .mjs 인 이유가 그것뿐이다.
import { register } from 'tsx/esm/api';
register();
await import('./gen-worker.ts');
