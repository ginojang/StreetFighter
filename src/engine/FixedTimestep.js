import { FRAME_TIME } from '../constants/game.js';

/**
 * 고정 timestep 누산기 (Phase 1).
 *
 * 매 프레임 실제 경과 시간을 누적하고, `fixedDt`(기본 1프레임=1000/60ms)만큼
 * 쌓일 때마다 시뮬 틱 한 번을 돌려야 한다고 알려 준다. 렌더 보간용 위상 `alpha`
 * (0~1, 다음 틱까지의 진행도)도 노출한다 — Phase 2에서 소비.
 *
 * 왜 순수 모듈인가: 게임 루프에서 이 수학만 떼어 내면 DOM 없이 node로 검증할 수 있다.
 * `advance()`는 부작용이 내부 누산기 하나뿐이라 결정적이다.
 *
 * - **스파이럴 방지**: 한 프레임이 아무리 길어도(탭 복귀·GC 멈춤) 누산기를
 *   `fixedDt * maxSteps`로 클램프해 따라잡기 폭주를 막는다.
 * - **60Hz 무회귀**: 프레임 간격이 정확히 fixedDt면 매 프레임 정확히 1틱 →
 *   기존 가변 루프와 동일하게 동작한다.
 */
export const createTimestepper = ({
	fixedDt = FRAME_TIME,
	maxSteps = 5,
} = {}) => {
	let accumulator = 0;

	return {
		/**
		 * 이번 프레임의 실제 경과(ms, GAME_SPEED 등 배율을 이미 곱한 값)를 넣으면
		 * 돌려야 할 시뮬 틱 수를 반환한다. 남은 시간은 누산기에 보관돼 다음 프레임으로 이월.
		 */
		advance(elapsedMs) {
			accumulator += elapsedMs;

			// 스파이럴 방지: 밀린 시간을 maxSteps 틱분으로 제한.
			const ceiling = fixedDt * maxSteps;
			if (accumulator > ceiling) accumulator = ceiling;

			let steps = 0;
			while (accumulator >= fixedDt && steps < maxSteps) {
				accumulator -= fixedDt;
				steps += 1;
			}
			return steps;
		},

		/** 렌더 보간 위상 (0=직전 틱, 1=다음 틱). Phase 2에서 사용. */
		get alpha() {
			return accumulator / fixedDt;
		},

		/** 남은 누산치(ms). 진단용. */
		get pending() {
			return accumulator;
		},

		/** 탭 복귀 등에서 밀린 시간을 버리고 깨끗이 재시작(Phase 4에서 사용). */
		reset() {
			accumulator = 0;
		},
	};
};
