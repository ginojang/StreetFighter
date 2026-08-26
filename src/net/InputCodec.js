import { Control } from '../constants/controls.js';

/**
 * 한 프레임의 플레이어 입력을 콤팩트한 비트마스크(정수)로 인코딩/디코딩한다.
 *
 * 컨트롤이 10개뿐이라 하위 10비트로 전부 표현된다 → 프레임당 2바이트.
 * 호스트-권위 P2P에서 게스트는 이 비트마스크만 전송하고, 호스트는 이를
 * 받아 게임 플레이어(P1) 입력으로 "주입"한다. (InputHandler.applyRemoteInput)
 *
 * 비트 순서는 네트워크 와이어 포맷이므로 절대 재배열하지 말 것.
 * 새 컨트롤은 반드시 배열 "끝"에 추가한다.
 */
export const CONTROL_ORDER = [
	Control.LEFT, // bit 0
	Control.RIGHT, // bit 1
	Control.UP, // bit 2
	Control.DOWN, // bit 3
	Control.LIGHT_PUNCH, // bit 4
	Control.MEDIUM_PUNCH, // bit 5
	Control.HEAVY_PUNCH, // bit 6
	Control.LIGHT_KICK, // bit 7
	Control.MEDIUM_KICK, // bit 8
	Control.HEAVY_KICK, // bit 9
];

export const CONTROL_BIT = CONTROL_ORDER.reduce((acc, control, index) => {
	acc[control] = 1 << index;
	return acc;
}, {});

/**
 * { [Control]: boolean } 형태의 입력 상태를 비트마스크 정수로 인코딩.
 * @param {Object} controlState 예: { [Control.LEFT]: true, [Control.LIGHT_PUNCH]: true }
 * @returns {number} 하위 10비트 마스크
 */
export const encodeControls = (controlState) => {
	let bits = 0;
	for (const control of CONTROL_ORDER) {
		if (controlState[control]) bits |= CONTROL_BIT[control];
	}
	return bits;
};

/**
 * 비트마스크 정수를 { [Control]: boolean } 로 디코딩.
 * @param {number} bits
 * @returns {Object} 모든 컨트롤 키를 가진 상태 객체
 */
export const decodeControls = (bits) => {
	const controlState = {};
	for (const control of CONTROL_ORDER) {
		controlState[control] = (bits & CONTROL_BIT[control]) !== 0;
	}
	return controlState;
};

/** 특정 컨트롤이 마스크에서 눌려 있는지 질의. */
export const isControlSet = (bits, control) =>
	(bits & CONTROL_BIT[control]) !== 0;
