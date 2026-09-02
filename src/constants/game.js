// 1 = 100% 2 = 200% , 0.5 = 50% half
// ONLY SHOULD BE USED FOR DEBUGGING
export let GAME_SPEED = 1;
export const FPS = 60;
export const FRAME_TIME = 1000 / FPS;

// 내부 렌더 해상도 배율. 시뮬은 382×224 게임단위로 돌지만, 캔버스 백킹을 이 배율만큼
// 키워(1528×896) 이동을 디스플레이 픽셀 격자에 스냅한다 → 게임픽셀 계단 대신 부드러운 이동.
// 스프라이트는 정수배 확대라 픽셀아트는 그대로 또렷. 모든 기기에서 이 해상도로 고정 렌더 →
// CSS가 화면에 비율유지로 맞춘다(해상도 독립). 값을 바꾸면 부드러움·fill비용(≈S²)이 함께 변함.
export const RENDER_SCALE = 4;
